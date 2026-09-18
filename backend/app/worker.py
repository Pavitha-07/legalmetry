
from celery import Celery
from celery.schedules import crontab
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import SessionLocal

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Optional
from uuid import UUID

from sqlalchemy import select

from app.models import (
    EvidenceFile,
    Inspection,
    InspectionStatus,
    JobStatus,
    PanelCapture,
    ProcessingJob,
    ShotType,
    ViolationCase,
    ViolationCaseStatus,
)

from app.services.compliance import evaluate_and_store
from app.services.extraction import extract_declarations

from app.services.gemini_vision import (
    GEMINI_FIXED_CONFIDENCE,
    GeminiVisionError,
    extract_declarations_via_gemini,
)

from app.services.groq_vision import (
    GROQ_FIXED_CONFIDENCE,
    GroqRateLimitError,
    GroqVisionError,
    extract_declarations_via_groq,
)

from app.services.ocr import recognize_english
from app.services.storage import get_bytes


settings = get_settings()

celery_app = Celery(
    "legalmetry",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.task_track_started = True
celery_app.conf.timezone = "UTC"

celery_app.conf.beat_schedule = {
    "escalate-lapsed-violation-cases": {
        "task": "escalate_lapsed_violation_cases",
        "schedule": crontab(hour=2, minute=0),
    },
}


@celery_app.task(name="process_panel_pair")
def process_panel_pair(inspection_id: str, job_id: str) -> None:
    db: Session = SessionLocal()

    try:
        job = db.get(ProcessingJob, job_id)
        inspection = db.get(Inspection, inspection_id)

        if job is None or inspection is None:
            return

        job.status = JobStatus.RUNNING
        inspection.status = InspectionStatus.PROCESSING
        db.commit()

        # Resolve the panel_id for this processing job.
        panel_id: Optional[UUID] = None

        try:
            panel_id = UUID(
                json.loads(job.detail or "{}")["panel_id"]
            )
        except (
            KeyError,
            ValueError,
            TypeError,
            json.JSONDecodeError,
        ):
            # Fall back to the most recent upload for this inspection.
            pass

        # ---------------------------------------------------------
        # COIN CALIBRATION DISABLED
        # ---------------------------------------------------------
        # Coin detection and font-size measurement are temporarily
        # disabled. The system will focus on OCR and declarations.
        # ---------------------------------------------------------

        calibration = {
            "status": "not_requested",
            "reason": "Coin calibration is temporarily disabled.",
        }

        # ---------------------------------------------------------
        # FIND OCR EVIDENCE FILE
        # ---------------------------------------------------------

        if panel_id is not None:
            ocr_query = select(EvidenceFile).where(
                EvidenceFile.panel_id == panel_id,
                EvidenceFile.shot_type == ShotType.OCR,
            )
        else:
            ocr_query = (
                select(EvidenceFile)
                .join(PanelCapture)
                .where(
                    PanelCapture.inspection_id == inspection.id,
                    EvidenceFile.shot_type == ShotType.OCR,
                )
                .order_by(EvidenceFile.created_at.desc())
            )

        ocr_file = db.scalar(ocr_query)

        ocr_bytes = (
            get_bytes(ocr_file.object_key)
            if ocr_file
            else None
        )

        # ---------------------------------------------------------
        # GROQ VISION EXTRACTION
        # ---------------------------------------------------------

        vision_declarations: dict | None = None
        vision_engine: str | None = None
        ocr_result: dict | None = None

        # Groq is the primary extraction path.
        if ocr_bytes and settings.groq_api_key:
            try:
                vision_declarations = extract_declarations_via_groq(
                    ocr_bytes
                )

                vision_engine = "groq"

            except GroqRateLimitError:
                # If Groq is rate-limited, try Gemini if configured.
                if settings.gemini_api_key:
                    try:
                        vision_declarations = (
                            extract_declarations_via_gemini(
                                ocr_bytes
                            )
                        )

                        vision_engine = "gemini"

                    except GeminiVisionError:
                        vision_declarations = None

            except GroqVisionError:
                # For other Groq errors, use PaddleOCR fallback.
                vision_declarations = None

        # ---------------------------------------------------------
        # PADDLEOCR FALLBACK
        # ---------------------------------------------------------
        # PaddleOCR runs only when:
        # 1. Vision extraction did not return a result.
        # 2. An OCR image exists.
        #
        # Font-size measurement no longer forces PaddleOCR because
        # coin calibration has been disabled.
        # ---------------------------------------------------------

        need_paddleocr = (
            ocr_bytes is not None
            and vision_declarations is None
        )

        if need_paddleocr:
            ocr_result = recognize_english(
                ocr_bytes,
                Path(
                    ocr_file.original_filename
                ).suffix or ".jpg",
            )

        elif not ocr_bytes:
            ocr_result = {
                "raw_text": "",
                "confidence": 0.0,
                "regions": [],
            }

        else:
            # Groq or Gemini succeeded.
            # No PaddleOCR pass is needed.
            ocr_result = {
                "raw_text": "",
                "confidence": 0.0,
                "regions": [],
            }

        # ---------------------------------------------------------
        # CONFIDENCE
        # ---------------------------------------------------------

        vision_confidence = {
            "groq": GROQ_FIXED_CONFIDENCE,
            "gemini": GEMINI_FIXED_CONFIDENCE,
        }.get(vision_engine)

        # ---------------------------------------------------------
        # SAVE THIS PANEL'S OCR RESULT
        # ---------------------------------------------------------

        this_panel = (
            db.get(PanelCapture, panel_id)
            if panel_id is not None
            else (
                ocr_file.panel
                if ocr_file
                else None
            )
        )

        if this_panel is not None:
            this_panel.ocr_result = {
                "panel_name": this_panel.panel_name.value,
                "engine": vision_engine or "paddleocr",
                "raw_text": ocr_result["raw_text"],
                "confidence": (
                    vision_confidence
                    if vision_confidence is not None
                    else ocr_result["confidence"]
                ),
                "regions": ocr_result["regions"],
                "declarations": vision_declarations,
            }

            db.commit()

        # ---------------------------------------------------------
        # COMBINE RESULTS FROM ALL PANELS
        # ---------------------------------------------------------

        all_panels = list(
            db.scalars(
                select(PanelCapture).where(
                    PanelCapture.inspection_id == inspection.id
                )
            )
        )

        panel_results = [
            panel.ocr_result
            for panel in all_panels
            if panel.ocr_result
        ]

        combined_raw_text = "\n\n".join(
            f"--- {result['panel_name'].upper()} PANEL ---\n"
            f"{result['raw_text']}"
            for result in panel_results
            if result.get("raw_text", "").strip()
        )

        combined_regions = [
            region
            for result in panel_results
            for region in result.get("regions", [])
        ]

        # ---------------------------------------------------------
        # COMBINE CONFIDENCE VALUES
        # ---------------------------------------------------------

        usable_confidences = [
            result["confidence"]
            for result in panel_results
            if (
                result.get("raw_text", "").strip()
                or result.get("declarations")
            )
        ]

        combined_confidence = (
            round(
                sum(usable_confidences)
                / len(usable_confidences),
                4,
            )
            if usable_confidences
            else 0.0
        )

        # ---------------------------------------------------------
        # GROUP OCR REGIONS
        # ---------------------------------------------------------

        region_groups: dict[
            tuple[str, str],
            list[dict]
        ] = {}

        for result in panel_results:
            for region in result.get("regions", []):
                key = (
                    result.get("panel_name", ""),
                    region.get("source", "primary"),
                )

                region_groups.setdefault(key, []).append(region)

        # ---------------------------------------------------------
        # EXTRACT DECLARATIONS FROM OCR TEXT
        # ---------------------------------------------------------

        automated_facts = extract_declarations(
            combined_raw_text,
            list(region_groups.values()),
        )

        # ---------------------------------------------------------
        # APPLY VISION DECLARATIONS
        # ---------------------------------------------------------
        # Groq/Gemini values take priority when a field is populated.
        # Empty or null vision fields do not overwrite OCR values.
        # ---------------------------------------------------------

        for result in panel_results:
            declarations = result.get("declarations")

            if not declarations:
                continue

            for field in (
                "product_name",
                "mrp",
                "net_quantity",
                "manufacture_date",
                "best_before",
                "lot_number",
                "consumer_care",
                "manufacturer",
                "unit_sale_price",
                "dimensions",
            ):
                value = declarations.get(field)

                if value not in (
                    None,
                    "",
                    {},
                    [],
                ):
                    automated_facts[field] = value

            country = declarations.get("country_of_origin")

            if country:
                automated_facts["country_of_origin"] = country

                automated_facts["product_origin"] = (
                    "domestic"
                    if str(country).strip().lower() == "india"
                    else "imported"
                )

        # ---------------------------------------------------------
        # SAVE OCR METADATA
        # ---------------------------------------------------------

        automated_facts.update(
            {
                "ocr_confidence": combined_confidence,
                "ocr_regions": combined_regions,
                "ocr_language": "en",
            }
        )

        # ---------------------------------------------------------
        # FONT MEASUREMENT DISABLED
        # ---------------------------------------------------------
        # Coin calibration and font-size measurement are disabled.
        # Existing inspection data is not used to trigger calibration.
        # ---------------------------------------------------------

        automated_facts["font_measurements"] = {
            "status": "not_requested",
            "note": "Coin calibration and font-size measurement are temporarily disabled.",
        }

        # ---------------------------------------------------------
        # UPDATE INSPECTION DATA
        # ---------------------------------------------------------
        # Newly extracted facts are merged with existing data.
        # Existing manually entered fields are retained when no new
        # value is produced.
        # ---------------------------------------------------------

        inspection.extracted_data = {
            **(inspection.extracted_data or {}),
            **automated_facts,
        }

        # ---------------------------------------------------------
        # EVALUATE COMPLIANCE
        # ---------------------------------------------------------

        result = evaluate_and_store(
            db,
            inspection,
        )

        # ---------------------------------------------------------
        # MARK JOB AS COMPLETED
        # ---------------------------------------------------------

        job.status = JobStatus.COMPLETED

        job.detail = json.dumps(
            {
                "overall_status": result.get(
                    "overall_status"
                ),
                "calibration": calibration,
                "ocr": {
                    "language": "en",
                    "engine": (
                        vision_engine
                        or "paddleocr"
                    ),
                    "confidence": (
                        vision_confidence
                        if vision_confidence is not None
                        else ocr_result["confidence"]
                    ),
                    "regions": len(
                        ocr_result["regions"]
                    ),
                },
            }
        )

        db.commit()

    except Exception as exc:
        # Roll back any incomplete database transaction.
        db.rollback()

        # Mark the processing job as failed.
        job = db.get(
            ProcessingJob,
            job_id,
        )

        if job:
            job.status = JobStatus.FAILED
            job.detail = str(exc)

        # Prevent the inspection from remaining stuck in PROCESSING.
        stuck = db.get(
            Inspection,
            inspection_id,
        )

        if (
            stuck is not None
            and stuck.status == InspectionStatus.PROCESSING
        ):
            stuck.status = InspectionStatus.NEEDS_REVIEW

        db.commit()

        # Keep the exception visible in Celery logs.
        raise

    finally:
        db.close()


@celery_app.task(name="escalate_lapsed_violation_cases")
def escalate_lapsed_violation_cases() -> None:
    """
    Daily check:
    Any correction window that has expired without being marked
    rectified is escalated to a fine recommendation.
    """

    db: Session = SessionLocal()

    try:
        now = datetime.now(UTC)

        due_case_ids = list(
            db.scalars(
                select(ViolationCase.id).where(
                    ViolationCase.status
                    == ViolationCaseStatus.AWAITING_RECTIFICATION,
                    ViolationCase.window_due_at < now,
                )
            )
        )

        for case_id in due_case_ids:
            case = db.get(
                ViolationCase,
                case_id,
            )

            if (
                case is None
                or case.status
                != ViolationCaseStatus.AWAITING_RECTIFICATION
            ):
                continue

            case.status = (
                ViolationCaseStatus.ESCALATED_PENDING_FINE
            )

            case.escalated_at = now

            db.commit()

    finally:
        db.close()
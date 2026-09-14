from celery import Celery
from celery.schedules import crontab
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import SessionLocal
import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID
from typing import Optional

import cv2
import numpy as np
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
from app.services.calibration import detect_ten_rupee_coin, measure_text_heights
from app.services.compliance import evaluate_and_store
from app.services.extraction import extract_declarations
from app.services.gemini_vision import GEMINI_FIXED_CONFIDENCE, GeminiVisionError, extract_declarations_via_gemini
from app.services.groq_vision import GROQ_FIXED_CONFIDENCE, GroqRateLimitError, GroqVisionError, extract_declarations_via_groq
from app.services.ocr import recognize_english
from app.services.storage import get_bytes

settings = get_settings()
celery_app = Celery("legalmetry", broker=settings.redis_url, backend=settings.redis_url)
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

        # Resolve the panel_id this job was dispatched for.  Initialise to
        # None explicitly so the fallback queries below never rely on
        # locals() or variable binding timing.
        panel_id: Optional[UUID] = None
        try:
            panel_id = UUID(json.loads(job.detail or "{}")["panel_id"])
        except (KeyError, ValueError, TypeError, json.JSONDecodeError):
            # A retried or legacy job whose detail JSON is malformed — fall
            # back to the most recent upload for this inspection below.
            pass

        if not inspection.measure_font_size:
            calibration = {
                "status": "not_requested",
                "reason": "Font-size measurement was not requested for this inspection.",
            }
        else:
            if panel_id is not None:
                calibration_query = select(EvidenceFile).where(
                    EvidenceFile.panel_id == panel_id,
                    EvidenceFile.shot_type == ShotType.CALIBRATION,
                )
            else:
                calibration_query = (
                    select(EvidenceFile)
                    .join(PanelCapture)
                    .where(
                        PanelCapture.inspection_id == inspection.id,
                        EvidenceFile.shot_type == ShotType.CALIBRATION,
                    )
                    .order_by(EvidenceFile.created_at.desc())
                )

            calibration_file = db.scalar(calibration_query)
            calibration = (
                detect_ten_rupee_coin(get_bytes(calibration_file.object_key)).to_dict()
                if calibration_file
                else {"status": "needs_review", "reason": "Calibration shot is missing."}
            )

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
        ocr_bytes = get_bytes(ocr_file.object_key) if ocr_file else None

        # Primary path: Groq's vision model reads the declarations directly
        # (fast, no detect-then-regex-then-spatial-pairing pipeline needed).
        # On a hard Groq failure, fall to Gemini ONLY if Groq specifically
        # rate-limited (HTTP 429) — any other failure (network, timeout,
        # malformed response) skips straight to PaddleOCR, same as before.
        # Never falls back on "found fewer fields than expected," since an
        # empty field can legitimately mean the label doesn't have it, same
        # as PaddleOCR.
        #
        # Font-height measurement is the one thing no vision model's output
        # can substitute for: it needs the actual pixel bounding boxes
        # PaddleOCR returns per region. So when this inspection asked for
        # font-size measurement, PaddleOCR still runs regardless of whether
        # Groq/Gemini succeeded — just for its regions, not re-parsed for
        # declarations.
        vision_declarations: dict | None = None
        vision_engine: str | None = None
        ocr_result: dict | None = None

        if ocr_bytes and settings.groq_api_key:
            try:
                vision_declarations = extract_declarations_via_groq(ocr_bytes)
                vision_engine = "groq"
            except GroqRateLimitError:
                if settings.gemini_api_key:
                    try:
                        vision_declarations = extract_declarations_via_gemini(ocr_bytes)
                        vision_engine = "gemini"
                    except GeminiVisionError:
                        vision_declarations = None  # fall through to PaddleOCR below
            except GroqVisionError:
                vision_declarations = None  # fall through to PaddleOCR below

        need_paddleocr = ocr_bytes and (vision_declarations is None or inspection.measure_font_size)
        if need_paddleocr:
            ocr_result = recognize_english(ocr_bytes, Path(ocr_file.original_filename).suffix or ".jpg")
        elif not ocr_bytes:
            ocr_result = {"raw_text": "", "confidence": 0.0, "regions": []}
        else:
            # A vision model succeeded and font-height wasn't requested —
            # no need to pay for a PaddleOCR pass at all.
            ocr_result = {"raw_text": "", "confidence": 0.0, "regions": []}

        vision_confidence = {"groq": GROQ_FIXED_CONFIDENCE, "gemini": GEMINI_FIXED_CONFIDENCE}.get(vision_engine)

        # Persist this panel's own read. OCR/vision is the expensive step
        # (many seconds per image); once it is done for a panel it is never
        # re-run, only recombined with other panels' already-computed reads.
        this_panel = (
            db.get(PanelCapture, panel_id) if panel_id is not None else (ocr_file.panel if ocr_file else None)
        )
        if this_panel is not None:
            this_panel.ocr_result = {
                "panel_name": this_panel.panel_name.value,
                "engine": vision_engine or "paddleocr",
                "raw_text": ocr_result["raw_text"],
                "confidence": vision_confidence if vision_confidence is not None else ocr_result["confidence"],
                "regions": ocr_result["regions"],
                "declarations": vision_declarations,
            }
            db.commit()

        # Combine every panel processed so far for this inspection into one
        # corpus. A declaration split across panels (MRP on the front,
        # manufacturer address on the back) must not be lost just because
        # only one panel's raw text made it into extracted_data.
        all_panels = list(db.scalars(select(PanelCapture).where(PanelCapture.inspection_id == inspection.id)))
        panel_results = [p.ocr_result for p in all_panels if p.ocr_result]
        combined_raw_text = "\n\n".join(
            f"--- {r['panel_name'].upper()} PANEL ---\n{r['raw_text']}"
            for r in panel_results
            if r.get("raw_text", "").strip()
        )
        combined_regions = [region for r in panel_results for region in r.get("regions", [])]
        # A Groq-only panel (font-height not requested) has no raw_text at
        # all — it must still contribute its own confidence, or a
        # multi-panel inspection where every panel used Groq would compute
        # an empty average and read as 0% confidence.
        usable_confidences = [
            r["confidence"] for r in panel_results if r.get("raw_text", "").strip() or r.get("declarations")
        ]
        combined_confidence = round(sum(usable_confidences) / len(usable_confidences), 4) if usable_confidences else 0.0

        # Group regions by the image they were actually detected in (a
        # panel's primary shot and its rotated declaration-strip crop are
        # separate coordinate spaces — see ocr.py's "source" tagging) so
        # spatial label/value pairing never compares distances across two
        # unrelated pixel spaces.
        region_groups: dict[tuple[str, str], list[dict]] = {}
        for r in panel_results:
            for region in r.get("regions", []):
                key = (r.get("panel_name", ""), region.get("source", "primary"))
                region_groups.setdefault(key, []).append(region)

        automated_facts = extract_declarations(combined_raw_text, list(region_groups.values()))

        # Groq's structured read takes priority over the regex/spatial-
        # pairing result on any field it actually populated — a dedicated
        # vision model reasoning about the whole label should out-perform
        # per-region regex heuristics. Fields it left null fall back to
        # whatever the regex pass found on any PaddleOCR-sourced panel
        # (fallback panels, or panels processed for font-height regions).
        # See groq_vision.py's docstring for the one known caveat:
        # manufacturer name/address can be hallucinated on hard-to-read
        # print rather than returned as null — not mitigated here yet.
        for r in panel_results:
            declarations = r.get("declarations")
            if not declarations:
                continue
            for field in (
                "product_name", "mrp", "net_quantity", "manufacture_date", "best_before",
                "lot_number", "consumer_care", "manufacturer", "unit_sale_price", "dimensions",
            ):
                value = declarations.get(field)
                if value not in (None, "", {}, []):
                    automated_facts[field] = value
            country = declarations.get("country_of_origin")
            if country:
                automated_facts["country_of_origin"] = country
                automated_facts["product_origin"] = "domestic" if str(country).strip().lower() == "india" else "imported"

        automated_facts.update(
            {
                "ocr_confidence": combined_confidence,
                "ocr_regions": combined_regions,
                "ocr_language": "en",
            }
        )

        existing_font = ((inspection.extracted_data or {}).get("font_measurements")) or {}
        if existing_font.get("status") == "calibrated":
            # Font-height evidence is tied to one specific coin-calibrated
            # shot; keep whichever panel calibrated successfully first
            # rather than replacing it with a later, unrelated panel's
            # (possibly uncalibrated) result.
            automated_facts["font_measurements"] = existing_font
        elif calibration["status"] == "not_requested":
            automated_facts["font_measurements"] = {
                "status": "not_requested",
                "note": "Font-size measurement was not requested for this inspection.",
            }
        elif calibration["status"] == "calibrated" and calibration.get("pixels_per_mm"):
            ocr_image = cv2.imdecode(np.frombuffer(ocr_bytes, np.uint8), cv2.IMREAD_COLOR) if ocr_bytes else None
            ocr_dimensions = (
                {"width": int(ocr_image.shape[1]), "height": int(ocr_image.shape[0])} if ocr_image is not None else None
            )
            calibration_dimensions = {"width": calibration.get("image_width"), "height": calibration.get("image_height")}
            dimensions_match = bool(
                ocr_dimensions
                and calibration_dimensions["width"] == ocr_dimensions["width"]
                and calibration_dimensions["height"] == ocr_dimensions["height"]
            )
            automated_facts["font_measurements"] = {
                "status": "calibrated",
                "pixels_per_mm": calibration["pixels_per_mm"],
                "reference": "₹10 coin (27 mm diameter)",
                "pair_scale_check": {
                    "dimensions_match": dimensions_match,
                    "calibration_image": calibration_dimensions,
                    "ocr_image": ocr_dimensions,
                    "note": "Matching dimensions are a basic safeguard; inspectors must also keep distance and zoom unchanged.",
                },
                "measurements": measure_text_heights(ocr_result["regions"], calibration["pixels_per_mm"]),
                "note": "Measurements are evidence for review; legal minimum-height thresholds are not yet encoded.",
            }
        else:
            automated_facts["font_measurements"] = {
                "status": "needs_review",
                "note": "No reliable ₹10 coin scale was available for font-height measurement.",
            }
        # automated_facts (freshly recomputed from every panel processed so
        # far) wins on any key it produces — this is what lets a later
        # panel's better reading of a field replace an earlier, garbled one.
        # Keys it does NOT produce (including anything an inspector already
        # corrected by hand via the Report screen) fall back to whatever is
        # already stored. Known trade-off: adding a new panel *after* a
        # manual edit re-runs extraction and can overwrite that edit if the
        # newly combined text produces a value for the same field.
        inspection.extracted_data = {**(inspection.extracted_data or {}), **automated_facts}
        result = evaluate_and_store(db, inspection)
        job.status = JobStatus.COMPLETED
        job.detail = json.dumps(
            {
                "overall_status": result.get("overall_status"),
                "calibration": calibration,
                "ocr": {
                    "language": "en",
                    "engine": vision_engine or "paddleocr",
                    "confidence": vision_confidence if vision_confidence is not None else ocr_result["confidence"],
                    "regions": len(ocr_result["regions"]),
                },
            }
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        # Mark the job FAILED so the supervisor can see what went wrong.
        job = db.get(ProcessingJob, job_id)
        if job:
            job.status = JobStatus.FAILED
            job.detail = str(exc)
        # Reset a PROCESSING inspection to NEEDS_REVIEW so it doesn't stay
        # stuck spinning forever with no way to retry. The worker set it to
        # PROCESSING at the top of this task; a crash before the commit at
        # line ~312 leaves it there permanently without this guard.
        stuck = db.get(Inspection, inspection_id)
        if stuck is not None and stuck.status == InspectionStatus.PROCESSING:
            stuck.status = InspectionStatus.NEEDS_REVIEW
        db.commit()
        raise
    finally:
        db.close()


@celery_app.task(name="escalate_lapsed_violation_cases")
def escalate_lapsed_violation_cases() -> None:
    """Daily check: any correction window that lapsed without being marked
    rectified gets auto-escalated to a fine recommendation.

    Each row is re-checked against its live status immediately before the
    update, not just filtered in the initial SELECT — this is the race
    guard. A case that gets rectified between this task's SELECT and its
    per-row update simply fails that re-check and is skipped, so the task
    is safe to run more than once and never escalates a case a human just
    closed.
    """
    db: Session = SessionLocal()
    try:
        now = datetime.now(UTC)
        due_case_ids = list(
            db.scalars(
                select(ViolationCase.id).where(
                    ViolationCase.status == ViolationCaseStatus.AWAITING_RECTIFICATION,
                    ViolationCase.window_due_at < now,
                )
            )
        )
        for case_id in due_case_ids:
            case = db.get(ViolationCase, case_id)
            if case is None or case.status != ViolationCaseStatus.AWAITING_RECTIFICATION:
                continue
            case.status = ViolationCaseStatus.ESCALATED_PENDING_FINE
            case.escalated_at = now
            db.commit()
    finally:
        db.close()

import hashlib
import json
import re
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, UTC

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Text, case, cast, func, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.db import Base, engine, get_db
from app.models import (
    CaptureSource,
    CorrectiveAction,
    CorrectiveActionStatus,
    EvidenceFile,
    Finding,
    Inspection,
    InspectionStatus,
    JobStatus,
    Manufacturer,
    ManufacturerComplianceRecord,
    PanelCapture,
    ProcessingJob,
    RectificationEvidence,
    ShotType,
    User,
    UserRole,
    ViolationCase,
    ViolationCaseStatus,
)
from app.schemas import (
    DashboardSummary,
    CategorySummary,
    ConfirmComplianceRequest,
    ConfirmViolationRequest,
    CorrectiveActionRead,
    EvidenceDownloadUrl,
    ExtractedFactsUpdate,
    FindingReviewAction,
    InspectionCreate,
    InspectionRead,
    InspectionUpdate,
    IssueFineRequest,
    LoginRequest,
    ManufacturerComplianceRecordRead,
    ManufacturerCreate,
    ManufacturerRead,
    PanchnamaRequest,
    PanelCreate,
    PanelRead,
    PublicManufacturerComplianceRead,
    PublicManufacturerLookupResponse,
    RectifyCaseRequest,
    Token,
    UserCreate,
    UserRead,
    ViolationByRule,
    ViolationCaseRead,
    WeeklyTrendPoint,
)
from app.security import create_access_token, current_user, hash_password, require_roles, verify_password
from app.services.compliance import evaluate_and_store
from app.services.escalation import is_improvement_notice_eligible
from app.services.report import generate_inspection_proforma, generate_seizure_memo, generate_panchnama
from app.services.storage import ensure_bucket, presigned_download_url, put_bytes
from app.worker import process_panel_pair

@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Replaces the deprecated @app.on_event('startup') pattern.
    Runs once when uvicorn starts: creates DB tables, ensures MinIO bucket
    exists, and seeds the initial supervisor account if configured.
    """
    Base.metadata.create_all(bind=engine)
    ensure_bucket()
    settings = get_settings()
    if settings.initial_supervisor_email and settings.initial_supervisor_password:
        with Session(engine) as db:
            existing = db.scalar(select(User).where(User.email == settings.initial_supervisor_email.lower()))
            if existing is None:
                db.add(
                    User(
                        email=settings.initial_supervisor_email.lower(),
                        full_name="Initial Supervisor",
                        password_hash=hash_password(settings.initial_supervisor_password),
                        role=UserRole.SUPERVISOR,
                    )
                )
                db.commit()
    yield  # application runs here
    # No shutdown logic needed.


app = FastAPI(title="LegalMetry API", version="0.1.0", lifespan=lifespan)
_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    # Origins are read from the CORS_ORIGINS env var (comma-separated).
    # Set it to your deployed app URL(s) in production.
    # For local dev: CORS_ORIGINS=http://localhost:8081,http://127.0.0.1:8081
    allow_origins=_settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def inspection_query():
    return select(Inspection).options(
        selectinload(Inspection.panels).selectinload(PanelCapture.uploads),
        selectinload(Inspection.findings),
        selectinload(Inspection.jobs),
    )


def inspection_for_user(db: Session, inspection_id: uuid.UUID, user: User) -> Inspection:
    query = inspection_query().where(Inspection.id == inspection_id)
    if user.role == UserRole.INSPECTOR:
        query = query.where(Inspection.inspector_id == user.id)
    inspection = db.scalar(query)
    if inspection is None:
        raise HTTPException(status_code=404, detail="Inspection not found")
    return inspection


def new_reference() -> str:
    return f"LM-{datetime.now():%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"


def violation_case_query():
    return select(ViolationCase).options(
        selectinload(ViolationCase.manufacturer),
        selectinload(ViolationCase.evidence),
        selectinload(ViolationCase.inspection),
    )


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/auth/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register_inspector(payload: UserCreate, db: Session = Depends(get_db)) -> User:
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email is already registered")
    user = User(email=email, full_name=payload.full_name, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/auth/login", response_model=Token)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> Token:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive")
    return Token(access_token=create_access_token(user))


@app.get("/auth/me", response_model=UserRead)
def me(user: User = Depends(current_user)) -> User:
    return user


@app.post("/inspections", response_model=InspectionRead, status_code=status.HTTP_201_CREATED)
def create_inspection(
    payload: InspectionCreate, user: User = Depends(require_roles(UserRole.INSPECTOR)), db: Session = Depends(get_db)
) -> Inspection:
    inspection = Inspection(reference=new_reference(), inspector_id=user.id, status=InspectionStatus.CAPTURING, **payload.model_dump())
    db.add(inspection)
    db.commit()
    return inspection_for_user(db, inspection.id, user)


@app.get("/inspections", response_model=list[InspectionRead])
def list_inspections(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    q: str | None = Query(default=None, description="Matches product name, manufacturer, or outlet name."),
    status_filter: InspectionStatus | None = Query(default=None, alias="status"),
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[Inspection]:
    query = inspection_query().order_by(Inspection.created_at.desc())
    if user.role == UserRole.INSPECTOR:
        query = query.where(Inspection.inspector_id == user.id)
    if q:
        # declared_data/extracted_data are plain JSON (not JSONB), so a full
        # text-cast ILIKE is used rather than a JSON path operator — this
        # matches anywhere in either blob (e.g. a manufacturer name), not
        # just a specific key, which is an accepted trade-off at this scale.
        needle = f"%{q}%"
        query = query.where(
            Inspection.product_name.ilike(needle)
            | Inspection.outlet_name.ilike(needle)
            | cast(Inspection.declared_data, Text).ilike(needle)
            | cast(Inspection.extracted_data, Text).ilike(needle)
        )
    if status_filter:
        query = query.where(Inspection.status == status_filter)
    if date_from:
        query = query.where(Inspection.created_at >= date_from)
    if date_to:
        query = query.where(Inspection.created_at < date_to + timedelta(days=1))
    return list(db.scalars(query))


@app.get("/inspections/{inspection_id}", response_model=InspectionRead)
def get_inspection(inspection_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Inspection:
    return inspection_for_user(db, inspection_id, user)


@app.patch("/inspections/{inspection_id}", response_model=InspectionRead)
def update_inspection(
    inspection_id: uuid.UUID, payload: InspectionUpdate, user: User = Depends(require_roles(UserRole.INSPECTOR)), db: Session = Depends(get_db)
) -> Inspection:
    inspection = inspection_for_user(db, inspection_id, user)
    for field, value in payload.model_dump().items():
        setattr(inspection, field, value)
    db.commit()
    return inspection_for_user(db, inspection_id, user)


@app.post("/inspections/{inspection_id}/panels", response_model=PanelRead, status_code=status.HTTP_201_CREATED)
def create_panel(
    inspection_id: uuid.UUID, payload: PanelCreate, user: User = Depends(require_roles(UserRole.INSPECTOR)), db: Session = Depends(get_db)
) -> PanelCapture:
    inspection_for_user(db, inspection_id, user)
    panel = PanelCapture(inspection_id=inspection_id, **payload.model_dump())
    db.add(panel)
    db.commit()
    db.refresh(panel)
    return panel


@app.post("/panels/{panel_id}/uploads", response_model=PanelRead)
async def upload_panel_shot(
    panel_id: uuid.UUID,
    shot_type: ShotType,
    file: UploadFile = File(...),
    user: User = Depends(require_roles(UserRole.INSPECTOR)),
    db: Session = Depends(get_db),
) -> PanelCapture:
    panel = db.get(PanelCapture, panel_id)
    if panel is None:
        raise HTTPException(status_code=404, detail="Panel capture not found")
    inspection = inspection_for_user(db, panel.inspection_id, user)
    if db.scalar(select(EvidenceFile).where(EvidenceFile.panel_id == panel_id, EvidenceFile.shot_type == shot_type)):
        raise HTTPException(status_code=409, detail=f"{shot_type.value} shot already uploaded for this panel")
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG, or WEBP images are accepted")
    payload = await file.read()
    if not payload or len(payload) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image must be between 1 byte and 20 MB")
    digest = hashlib.sha256(payload).hexdigest()
    suffix = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[file.content_type]
    object_key = f"inspections/{panel.inspection_id}/panels/{panel.id}/{shot_type.value}-{digest[:16]}.{suffix}"
    put_bytes(object_key, payload, file.content_type)
    db.add(
        EvidenceFile(
            panel_id=panel.id,
            shot_type=shot_type,
            object_key=object_key,
            original_filename=re.sub(r"[^A-Za-z0-9._-]", "_", file.filename or f"upload.{suffix}"),
            content_type=file.content_type,
            size_bytes=len(payload),
            sha256=digest,
        )
    )
    db.commit()
    db.refresh(panel)
    shots = {upload.shot_type for upload in panel.uploads}
    ready = (
        {ShotType.CALIBRATION, ShotType.OCR}.issubset(shots)
        if inspection.measure_font_size
        else ShotType.OCR in shots
    )
    if ready:
        job = ProcessingJob(
            inspection_id=panel.inspection_id,
            job_type="panel_pair_ready",
            detail=json.dumps({"panel_id": str(panel.id)}),
        )
        db.add(job)
        db.commit()
        process_panel_pair.delay(str(panel.inspection_id), str(job.id))
    return panel


@app.put("/inspections/{inspection_id}/extracted-data", response_model=InspectionRead)
def save_extracted_data(
    inspection_id: uuid.UUID,
    payload: ExtractedFactsUpdate,
    user: User = Depends(require_roles(UserRole.INSPECTOR)),
    db: Session = Depends(get_db),
) -> Inspection:
    inspection = inspection_for_user(db, inspection_id, user)
    inspection.extracted_data = payload.extracted_data
    evaluate_and_store(db, inspection)
    db.commit()
    return inspection_for_user(db, inspection_id, user)


@app.get("/evidence/{evidence_id}/download-url", response_model=EvidenceDownloadUrl)
def evidence_download_url(
    evidence_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> EvidenceDownloadUrl:
    evidence = db.get(EvidenceFile, evidence_id)
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidence file not found")
    inspection_for_user(db, evidence.panel.inspection_id, user)
    return EvidenceDownloadUrl(url=presigned_download_url(evidence.object_key))


@app.get("/supervisor/dashboard", response_model=DashboardSummary)
def supervisor_dashboard(
    _: User = Depends(require_roles(UserRole.SUPERVISOR)), db: Session = Depends(get_db)
) -> DashboardSummary:
    counts = dict(db.execute(select(Inspection.status, func.count()).group_by(Inspection.status)).all())
    recent = list(db.scalars(inspection_query().order_by(Inspection.created_at.desc()).limit(20)))
    violation_reports = list(
        db.scalars(
            inspection_query().where(Inspection.status == InspectionStatus.VIOLATION).order_by(Inspection.updated_at.desc()).limit(20)
        )
    )
    rule_rows = db.execute(
        select(Finding.rule_id, Finding.requirement, func.count(Finding.id))
        .where(Finding.status == "FAIL")
        .group_by(Finding.rule_id, Finding.requirement)
        .order_by(func.count(Finding.id).desc(), Finding.rule_id)
    ).all()
    category_rows = db.execute(
        select(
            func.coalesce(Inspection.product_category, "Uncategorized"),
            func.count(Inspection.id),
            func.sum(case((Inspection.status == InspectionStatus.VIOLATION, 1), else_=0)),
        )
        .group_by(Inspection.product_category)
        .order_by(func.count(Inspection.id).desc())
    ).all()

    since = datetime.now(UTC) - timedelta(weeks=8)
    trend_rows = db.execute(
        select(
            func.date_trunc("week", Inspection.created_at).label("week_start"),
            func.count(Inspection.id),
            func.sum(case((Inspection.status == InspectionStatus.VIOLATION, 1), else_=0)),
        )
        .where(Inspection.created_at >= since)
        .group_by("week_start")
        .order_by("week_start")
    ).all()
    trend_by_week = {row[0].date(): (row[1], int(row[2] or 0)) for row in trend_rows}
    # Zero-fill every week in the window, not just the ones with data, so the
    # chart always shows a consistent 8-week axis instead of skipping gaps.
    today = datetime.now(UTC).date()
    this_week_start = today - timedelta(days=today.weekday())
    weekly_trend = [
        WeeklyTrendPoint(
            week_start=week_start,
            total=trend_by_week.get(week_start, (0, 0))[0],
            violations=trend_by_week.get(week_start, (0, 0))[1],
        )
        for week_start in (this_week_start - timedelta(weeks=offset) for offset in range(7, -1, -1))
    ]

    open_actions = list(
        db.scalars(
            select(CorrectiveAction)
            .options(selectinload(CorrectiveAction.inspection))
            .where(CorrectiveAction.status == CorrectiveActionStatus.OPEN)
            .order_by(CorrectiveAction.due_at.asc())
        )
    )
    overdue_count = sum(1 for a in open_actions if a.is_overdue)

    open_cases = list(
        db.scalars(
            violation_case_query()
            .where(ViolationCase.status == ViolationCaseStatus.AWAITING_RECTIFICATION)
            .order_by(ViolationCase.window_due_at.asc())
        )
    )
    overdue_cases = sum(1 for c in open_cases if c.is_overdue)
    escalation_queue = list(
        db.scalars(
            violation_case_query()
            .where(ViolationCase.status == ViolationCaseStatus.ESCALATED_PENDING_FINE)
            .order_by(ViolationCase.escalated_at.asc())
        )
    )

    return DashboardSummary(
        district_name=get_settings().single_district_name,
        total_inspections=sum(counts.values()),
        draft=counts.get(InspectionStatus.DRAFT, 0),
        processing=counts.get(InspectionStatus.PROCESSING, 0),
        needs_review=counts.get(InspectionStatus.NEEDS_REVIEW, 0),
        compliant=counts.get(InspectionStatus.COMPLIANT, 0),
        violation=counts.get(InspectionStatus.VIOLATION, 0),
        completed_reports=counts.get(InspectionStatus.COMPLIANT, 0)
        + counts.get(InspectionStatus.VIOLATION, 0)
        + counts.get(InspectionStatus.NEEDS_REVIEW, 0),
        violation_by_rule=[ViolationByRule(rule_id=row[0], requirement=row[1], count=row[2]) for row in rule_rows],
        inspections_by_category=[
            CategorySummary(category=row[0], total_inspections=row[1], violations=int(row[2] or 0)) for row in category_rows
        ],
        violation_reports=violation_reports,
        recent_inspections=recent,
        weekly_trend=weekly_trend,
        corrective_actions=open_actions,
        open_corrective_actions=len(open_actions),
        overdue_corrective_actions=overdue_count,
        violation_cases=open_cases,
        escalation_queue=escalation_queue,
        open_violation_cases=len(open_cases),
        overdue_violation_cases=overdue_cases,
        pending_fine_recommendations=len(escalation_queue),
    )


@app.patch("/findings/{finding_id}/review", response_model=InspectionRead)
def review_finding(
    finding_id: uuid.UUID,
    payload: FindingReviewAction,
    user: User = Depends(require_roles(UserRole.INSPECTOR)),
    db: Session = Depends(get_db),
) -> Inspection:
    """Allow an inspector to confirm or reject a NEEDS_REVIEW finding.

    confirm → marks the finding FAIL (inspector agrees it is a violation).
    reject  → marks the finding PASS (inspector judges the OCR misread it).

    The inspection's overall status is re-derived from all remaining findings
    after the change, so a single confirmation can tip the report to VIOLATION
    and a rejection that clears the last uncertain finding can move it to
    COMPLIANT.
    """
    finding = db.get(Finding, finding_id)
    if finding is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    inspection = inspection_for_user(db, finding.inspection_id, user)
    if finding.status != "NEEDS_REVIEW":
        raise HTTPException(
            status_code=409,
            detail="Only findings with status NEEDS_REVIEW can be reviewed.",
        )
    finding.status = "FAIL" if payload.action == "confirm" else "PASS"
    if payload.note:
        finding.reason = f"{finding.reason} [Inspector note: {payload.note}]"
    # Re-derive the inspection's overall status from all current finding statuses.
    all_statuses = {f.status for f in inspection.findings}
    if "FAIL" in all_statuses:
        inspection.status = InspectionStatus.VIOLATION
    elif "NEEDS_REVIEW" in all_statuses:
        inspection.status = InspectionStatus.NEEDS_REVIEW
    else:
        inspection.status = InspectionStatus.COMPLIANT
    db.commit()
    return inspection_for_user(db, inspection.id, user)


# ---------------------------------------------------------------------------
# Report generation endpoints
# ---------------------------------------------------------------------------

_SETTLED = {InspectionStatus.COMPLIANT, InspectionStatus.VIOLATION, InspectionStatus.NEEDS_REVIEW}
_PDF_HEADERS = {"Content-Disposition": "inline"}   # browser shows PDF, not forces download


def _assert_settled(inspection: Inspection) -> None:
    if inspection.status not in _SETTLED:
        raise HTTPException(
            status_code=409,
            detail="Report is only available once analysis is complete (compliant, violation, or needs_review).",
        )


def _assert_violation(inspection: Inspection) -> None:
    _assert_settled(inspection)
    if inspection.status != InspectionStatus.VIOLATION:
        raise HTTPException(
            status_code=409,
            detail="Seizure Memo and Panchnama are only generated for inspections with a VIOLATION outcome.",
        )


@app.get(
    "/inspections/{inspection_id}/report/proforma",
    summary="Download Inspection Proforma (Form IV-A)",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
def report_proforma(
    inspection_id: uuid.UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Generated for every settled inspection regardless of outcome."""
    inspection = inspection_for_user(db, inspection_id, user)
    _assert_settled(inspection)
    pdf_bytes = generate_inspection_proforma(inspection, db)
    filename = f"{inspection.reference}-proforma.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@app.get(
    "/inspections/{inspection_id}/report/seizure-memo",
    summary="Download Seizure Memo / Receipt (violation only)",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
def report_seizure_memo(
    inspection_id: uuid.UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Only available when the inspection outcome is VIOLATION."""
    inspection = inspection_for_user(db, inspection_id, user)
    _assert_violation(inspection)
    pdf_bytes = generate_seizure_memo(inspection, db)
    filename = f"{inspection.reference}-seizure-memo.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@app.post(
    "/inspections/{inspection_id}/report/panchnama",
    summary="Generate Panchnama with witness details (violation only)",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
def report_panchnama(
    inspection_id: uuid.UUID,
    payload: PanchnamaRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Requires witness (Pancha) details in the request body.
    Only available when the inspection outcome is VIOLATION.

    The correction period named in the Panchnama is the first and only time
    a correction deadline is recorded for this inspection, so generating the
    PDF also opens (or re-uses, if one already exists) a CorrectiveAction
    case for the district review dashboard to track.
    """
    inspection = inspection_for_user(db, inspection_id, user)
    _assert_violation(inspection)
    pdf_bytes = generate_panchnama(
        inspection=inspection,
        db=db,
        witness_one=payload.witness_one.model_dump(),
        witness_two=payload.witness_two.model_dump(),
        place_of_search=payload.place_of_search,
        officer_designation=payload.officer_designation or "Legal Metrology Inspector",
        correction_period_days=payload.correction_period_days,
    )
    if db.scalar(select(CorrectiveAction).where(CorrectiveAction.inspection_id == inspection.id)) is None:
        issued_at = datetime.now(UTC)
        db.add(
            CorrectiveAction(
                inspection_id=inspection.id,
                correction_period_days=payload.correction_period_days,
                issued_at=issued_at,
                due_at=issued_at + timedelta(days=payload.correction_period_days),
            )
        )
        db.commit()
    filename = f"{inspection.reference}-panchnama.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@app.patch("/corrective-actions/{action_id}/resolve", response_model=CorrectiveActionRead)
def resolve_corrective_action(
    action_id: uuid.UUID,
    user: User = Depends(require_roles(UserRole.SUPERVISOR)),
    db: Session = Depends(get_db),
) -> CorrectiveAction:
    action = db.get(CorrectiveAction, action_id, options=[selectinload(CorrectiveAction.inspection)])
    if action is None:
        raise HTTPException(status_code=404, detail="Corrective action not found")
    if action.status != CorrectiveActionStatus.OPEN:
        raise HTTPException(status_code=409, detail="This corrective action is already resolved")
    action.status = CorrectiveActionStatus.RESOLVED
    action.resolved_at = datetime.now(UTC)
    action.resolved_by_id = user.id
    db.commit()
    db.refresh(action)
    return action


# ---------------------------------------------------------------------------
# Supervisor confirmation -> correction window -> escalation
# ---------------------------------------------------------------------------


@app.post("/manufacturers", response_model=ManufacturerRead, status_code=status.HTTP_201_CREATED)
def create_manufacturer(
    payload: ManufacturerCreate,
    user: User = Depends(require_roles(UserRole.SUPERVISOR)),
    db: Session = Depends(get_db),
) -> Manufacturer:
    manufacturer = Manufacturer(created_by_id=user.id, **payload.model_dump())
    db.add(manufacturer)
    db.commit()
    db.refresh(manufacturer)
    return manufacturer


@app.get("/manufacturers", response_model=list[ManufacturerRead])
def search_manufacturers(
    q: str | None = Query(default=None),
    _: User = Depends(require_roles(UserRole.SUPERVISOR)),
    db: Session = Depends(get_db),
) -> list[Manufacturer]:
    query = select(Manufacturer).order_by(Manufacturer.name).limit(20)
    if q:
        query = query.where(Manufacturer.name.ilike(f"%{q}%"))
    return list(db.scalars(query))


@app.post("/findings/{finding_id}/confirm-violation", response_model=ViolationCaseRead)
def confirm_violation(
    finding_id: uuid.UUID,
    payload: ConfirmViolationRequest,
    user: User = Depends(require_roles(UserRole.SUPERVISOR)),
    db: Session = Depends(get_db),
) -> ViolationCase:
    """A supervisor's human confirmation that a FAIL finding is a genuine
    violation, distinct from the inspector's NEEDS_REVIEW -> FAIL/PASS
    review (see review_finding above). Only opens a correction window for
    rules the rule engine marks improvement-notice-eligible.
    """
    finding = db.get(Finding, finding_id)
    if finding is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    inspection_for_user(db, finding.inspection_id, user)
    if finding.status != "FAIL":
        raise HTTPException(status_code=409, detail="Only findings with status FAIL can be confirmed as a violation.")
    if not is_improvement_notice_eligible(finding.rule_id):
        raise HTTPException(
            status_code=422,
            detail="This provision is not eligible for an improvement notice / correction window.",
        )

    existing = db.scalar(
        violation_case_query().where(
            ViolationCase.inspection_id == finding.inspection_id, ViolationCase.rule_id == finding.rule_id
        )
    )
    if existing is not None:
        return existing

    if (payload.manufacturer_id is None) == (payload.new_manufacturer is None):
        raise HTTPException(
            status_code=400, detail="Provide exactly one of manufacturer_id or new_manufacturer."
        )
    if payload.new_manufacturer is not None:
        manufacturer = Manufacturer(created_by_id=user.id, **payload.new_manufacturer.model_dump())
        db.add(manufacturer)
        db.flush()
        manufacturer_id = manufacturer.id
    else:
        manufacturer = db.get(Manufacturer, payload.manufacturer_id)
        if manufacturer is None:
            raise HTTPException(status_code=404, detail="Manufacturer not found")
        manufacturer_id = manufacturer.id

    offence_number = 1 + (
        db.scalar(
            select(func.count(ViolationCase.id)).where(
                ViolationCase.manufacturer_id == manufacturer_id, ViolationCase.rule_id == finding.rule_id
            )
        )
        or 0
    )
    confirmed_at = datetime.now(UTC)
    case = ViolationCase(
        inspection_id=finding.inspection_id,
        rule_id=finding.rule_id,
        requirement=finding.requirement,
        legal_reference=finding.legal_reference,
        detected_value=finding.detected_value,
        reason=finding.reason,
        manufacturer_id=manufacturer_id,
        offence_number=offence_number,
        confirmed_by_id=user.id,
        confirmed_at=confirmed_at,
        correction_period_days=payload.correction_period_days,
        window_due_at=confirmed_at + timedelta(days=payload.correction_period_days),
    )
    db.add(case)
    db.commit()
    return db.scalar(violation_case_query().where(ViolationCase.id == case.id))


@app.post("/inspections/{inspection_id}/confirm-compliance", response_model=ManufacturerComplianceRecordRead)
def confirm_compliance(
    inspection_id: uuid.UUID,
    payload: ConfirmComplianceRequest,
    user: User = Depends(require_roles(UserRole.SUPERVISOR)),
    db: Session = Depends(get_db),
) -> ManufacturerComplianceRecord:
    """The positive counterpart to confirm_violation: a supervisor links a
    COMPLIANT inspection to a manufacturer so the public lookup can report
    "inspected, no violations" instead of staying silent. See
    ManufacturerComplianceRecord's docstring for why this needs the same
    manual linking as violations rather than an automatic name match.
    """
    inspection = inspection_for_user(db, inspection_id, user)
    if inspection.status != InspectionStatus.COMPLIANT:
        raise HTTPException(status_code=409, detail="Only a COMPLIANT inspection can be confirmed as a clean record.")

    existing = db.scalar(
        select(ManufacturerComplianceRecord)
        .options(selectinload(ManufacturerComplianceRecord.manufacturer))
        .where(ManufacturerComplianceRecord.inspection_id == inspection_id)
    )
    if existing is not None:
        return existing

    if (payload.manufacturer_id is None) == (payload.new_manufacturer is None):
        raise HTTPException(status_code=400, detail="Provide exactly one of manufacturer_id or new_manufacturer.")
    if payload.new_manufacturer is not None:
        manufacturer = Manufacturer(created_by_id=user.id, **payload.new_manufacturer.model_dump())
        db.add(manufacturer)
        db.flush()
        manufacturer_id = manufacturer.id
    else:
        manufacturer = db.get(Manufacturer, payload.manufacturer_id)
        if manufacturer is None:
            raise HTTPException(status_code=404, detail="Manufacturer not found")
        manufacturer_id = manufacturer.id

    record = ManufacturerComplianceRecord(
        inspection_id=inspection_id, manufacturer_id=manufacturer_id, confirmed_by_id=user.id
    )
    db.add(record)
    db.commit()
    return db.scalar(
        select(ManufacturerComplianceRecord)
        .options(selectinload(ManufacturerComplianceRecord.manufacturer))
        .where(ManufacturerComplianceRecord.id == record.id)
    )


@app.get("/violation-cases", response_model=list[ViolationCaseRead])
def list_violation_cases(
    status_filter: ViolationCaseStatus | None = Query(default=None, alias="status"),
    _: User = Depends(require_roles(UserRole.SUPERVISOR)),
    db: Session = Depends(get_db),
) -> list[ViolationCase]:
    query = violation_case_query().order_by(ViolationCase.confirmed_at.desc())
    if status_filter:
        query = query.where(ViolationCase.status == status_filter)
    return list(db.scalars(query))


def _get_violation_case(db: Session, case_id: uuid.UUID) -> ViolationCase:
    case = db.scalar(violation_case_query().where(ViolationCase.id == case_id))
    if case is None:
        raise HTTPException(status_code=404, detail="Violation case not found")
    return case


@app.post("/violation-cases/{case_id}/evidence", response_model=ViolationCaseRead)
async def upload_rectification_evidence(
    case_id: uuid.UUID,
    file: UploadFile = File(...),
    note: str | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ViolationCase:
    case = _get_violation_case(db, case_id)
    if case.status != ViolationCaseStatus.AWAITING_RECTIFICATION:
        raise HTTPException(status_code=409, detail="Evidence can only be attached while a case is awaiting rectification.")
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG, or WEBP images are accepted")
    payload = await file.read()
    if not payload or len(payload) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image must be between 1 byte and 20 MB")
    digest = hashlib.sha256(payload).hexdigest()
    suffix = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[file.content_type]
    object_key = f"violation-cases/{case.id}/{digest[:16]}.{suffix}"
    put_bytes(object_key, payload, file.content_type)
    db.add(
        RectificationEvidence(
            violation_case_id=case.id,
            object_key=object_key,
            original_filename=re.sub(r"[^A-Za-z0-9._-]", "_", file.filename or f"upload.{suffix}"),
            content_type=file.content_type,
            size_bytes=len(payload),
            sha256=digest,
            note=note,
            uploaded_by_id=user.id,
        )
    )
    db.commit()
    return _get_violation_case(db, case_id)


@app.patch("/violation-cases/{case_id}/rectify", response_model=ViolationCaseRead)
def rectify_violation_case(
    case_id: uuid.UUID,
    payload: RectifyCaseRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ViolationCase:
    case = _get_violation_case(db, case_id)
    if case.status != ViolationCaseStatus.AWAITING_RECTIFICATION:
        raise HTTPException(status_code=409, detail="Only a case awaiting rectification can be closed.")
    if not case.evidence:
        raise HTTPException(
            status_code=409,
            detail="At least one piece of evidence of correction must be attached before closing this case.",
        )
    case.status = ViolationCaseStatus.RECTIFIED_CLOSED
    case.rectified_at = datetime.now(UTC)
    case.rectified_by_id = user.id
    if payload.note:
        case.reason = f"{case.reason} [Rectification note: {payload.note}]"
    db.commit()
    return _get_violation_case(db, case_id)


@app.patch("/violation-cases/{case_id}/escalate", response_model=ViolationCaseRead)
def escalate_violation_case(
    case_id: uuid.UUID,
    user: User = Depends(require_roles(UserRole.SUPERVISOR)),
    db: Session = Depends(get_db),
) -> ViolationCase:
    """Manual counterpart to worker.py's nightly escalate_lapsed_violation_cases
    task — lets a supervisor push an overdue case to the fine track right
    away instead of waiting for the next 2am run. Same guard as the
    automatic job: only a case actually past its window and still
    unrectified can be escalated, so this can't be used to jump the gun on
    a case that still has time left."""
    case = _get_violation_case(db, case_id)
    if case.status != ViolationCaseStatus.AWAITING_RECTIFICATION:
        raise HTTPException(status_code=409, detail="Only a case awaiting rectification can be escalated.")
    if not case.is_overdue:
        raise HTTPException(status_code=409, detail="This case's correction window has not lapsed yet.")
    case.status = ViolationCaseStatus.ESCALATED_PENDING_FINE
    case.escalated_at = datetime.now(UTC)
    db.commit()
    return _get_violation_case(db, case_id)


@app.patch("/violation-cases/{case_id}/issue-fine", response_model=ViolationCaseRead)
def issue_fine(
    case_id: uuid.UUID,
    payload: IssueFineRequest,
    user: User = Depends(require_roles(UserRole.SUPERVISOR)),
    db: Session = Depends(get_db),
) -> ViolationCase:
    case = _get_violation_case(db, case_id)
    if case.status != ViolationCaseStatus.ESCALATED_PENDING_FINE:
        raise HTTPException(status_code=409, detail="Only an escalated case pending fine issuance can be fined.")
    case.status = ViolationCaseStatus.FINE_ISSUED
    case.fine_amount = payload.fine_amount
    case.fine_notes = payload.fine_notes
    case.fine_issued_at = datetime.now(UTC)
    case.fine_issued_by_id = user.id
    db.commit()
    return _get_violation_case(db, case_id)


# ---------------------------------------------------------------------------
# Public retailer lookup — no login. Deliberately the narrowest possible
# slice of the enforcement database: manufacturer identity plus unresolved
# vs. resolved violation counts, nothing else. No endpoint here ever takes
# a user/session dependency; that is what makes this public in the first
# place, so do not add auth to it and do not widen what it returns.
# ---------------------------------------------------------------------------

_COMPLIANCE_DISCLAIMER = (
    "This shows only violations this office has confirmed, and inspections it has "
    "explicitly logged as clean, against a manufacturer. A manufacturer with no "
    "results, or with no unresolved violations, has not been found non-compliant "
    "right now — it does not mean every product they make has been inspected."
)

_UNRESOLVED_CASE_STATUSES = {ViolationCaseStatus.AWAITING_RECTIFICATION, ViolationCaseStatus.ESCALATED_PENDING_FINE}


@app.get("/public/manufacturers", response_model=PublicManufacturerLookupResponse)
def public_manufacturer_lookup(
    q: str = Query(min_length=2, max_length=200),
    db: Session = Depends(get_db),
) -> PublicManufacturerLookupResponse:
    manufacturers = list(
        db.scalars(select(Manufacturer).where(Manufacturer.name.ilike(f"%{q}%")).order_by(Manufacturer.name).limit(20))
    )
    counts: dict[uuid.UUID, dict[str, int]] = {}
    clean_counts: dict[uuid.UUID, int] = {}
    if manufacturers:
        ids = [m.id for m in manufacturers]
        rows = db.execute(
            select(ViolationCase.manufacturer_id, ViolationCase.status, func.count())
            .where(ViolationCase.manufacturer_id.in_(ids))
            .group_by(ViolationCase.manufacturer_id, ViolationCase.status)
        ).all()
        for manufacturer_id, case_status, count in rows:
            bucket = counts.setdefault(manufacturer_id, {"unresolved": 0, "resolved": 0})
            bucket["unresolved" if case_status in _UNRESOLVED_CASE_STATUSES else "resolved"] += count

        clean_rows = db.execute(
            select(ManufacturerComplianceRecord.manufacturer_id, func.count())
            .where(ManufacturerComplianceRecord.manufacturer_id.in_(ids))
            .group_by(ManufacturerComplianceRecord.manufacturer_id)
        ).all()
        clean_counts = dict(clean_rows)

    return PublicManufacturerLookupResponse(
        results=[
            PublicManufacturerComplianceRead(
                id=m.id,
                name=m.name,
                address=m.address,
                unresolved_count=counts.get(m.id, {}).get("unresolved", 0),
                resolved_count=counts.get(m.id, {}).get("resolved", 0),
                clean_inspection_count=clean_counts.get(m.id, 0),
            )
            for m in manufacturers
        ],
        disclaimer=_COMPLIANCE_DISCLAIMER,
    )

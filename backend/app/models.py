import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Enum, ForeignKey, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class UserRole(str, enum.Enum):
    INSPECTOR = "inspector"
    SUPERVISOR = "supervisor"


class InspectionStatus(str, enum.Enum):
    DRAFT = "draft"
    CAPTURING = "capturing"
    PROCESSING = "processing"
    NEEDS_REVIEW = "needs_review"
    COMPLIANT = "compliant"
    VIOLATION = "violation"


class PanelName(str, enum.Enum):
    FRONT = "front"
    BACK = "back"
    LEFT = "left"
    RIGHT = "right"
    TOP = "top"
    BOTTOM = "bottom"


class CaptureSource(str, enum.Enum):
    CAMERA = "camera"
    GALLERY = "gallery"


class ShotType(str, enum.Enum):
    CALIBRATION = "calibration"
    OCR = "ocr"


class JobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class CorrectiveActionStatus(str, enum.Enum):
    OPEN = "open"
    RESOLVED = "resolved"


class ViolationCaseStatus(str, enum.Enum):
    AWAITING_RECTIFICATION = "awaiting_rectification"
    RECTIFIED_CLOSED = "rectified_closed"
    ESCALATED_PENDING_FINE = "escalated_pending_fine"
    FINE_ISSUED = "fine_issued"


class Timestamped:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(Timestamped, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.INSPECTOR)
    is_active: Mapped[bool] = mapped_column(default=True)
    inspections: Mapped[list["Inspection"]] = relationship(back_populates="inspector")


class Inspection(Timestamped, Base):
    __tablename__ = "inspections"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    reference: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    inspector_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[InspectionStatus] = mapped_column(Enum(InspectionStatus), default=InspectionStatus.DRAFT)
    outlet_name: Mapped[str | None] = mapped_column(String(250))
    outlet_address: Mapped[str | None] = mapped_column(Text)
    product_name: Mapped[str | None] = mapped_column(String(250))
    product_category: Mapped[str | None] = mapped_column(String(100), index=True)
    measure_font_size: Mapped[bool] = mapped_column(default=True)
    # A physical scale reading, not something OCR can produce — opt-in like
    # measure_font_size, but defaults False since not every inspection has
    # a scale on hand. The officer weighs the actual product and enters the
    # reading directly; net_quantity_tolerance.py compares it against the
    # declared quantity using the First Schedule's MPE tables.
    measure_net_quantity: Mapped[bool] = mapped_column(default=False)
    measured_net_quantity_value: Mapped[float | None] = mapped_column(nullable=True)
    measured_net_quantity_unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    measuring_instrument: Mapped[str | None] = mapped_column(String(200), nullable=True)
    declared_data: Mapped[dict] = mapped_column(JSON, default=dict)
    extracted_data: Mapped[dict] = mapped_column(JSON, default=dict)
    inspector: Mapped[User] = relationship(back_populates="inspections")
    panels: Mapped[list["PanelCapture"]] = relationship(back_populates="inspection", cascade="all, delete-orphan")
    findings: Mapped[list["Finding"]] = relationship(back_populates="inspection", cascade="all, delete-orphan")
    jobs: Mapped[list["ProcessingJob"]] = relationship(back_populates="inspection", cascade="all, delete-orphan")
    corrective_actions: Mapped[list["CorrectiveAction"]] = relationship(
        back_populates="inspection", cascade="all, delete-orphan"
    )
    violation_cases: Mapped[list["ViolationCase"]] = relationship(
        back_populates="inspection", cascade="all, delete-orphan"
    )


class PanelCapture(Timestamped, Base):
    __tablename__ = "panel_captures"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    inspection_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("inspections.id"), index=True)
    panel_name: Mapped[PanelName] = mapped_column(Enum(PanelName))
    capture_source: Mapped[CaptureSource] = mapped_column(Enum(CaptureSource))
    # This panel's own OCR read (raw_text/confidence/regions), persisted so
    # the worker can combine every panel's declarations into one corpus
    # without re-running OCR (the expensive step) on already-processed
    # panels every time another panel finishes.
    ocr_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    inspection: Mapped[Inspection] = relationship(back_populates="panels")
    uploads: Mapped[list["EvidenceFile"]] = relationship(back_populates="panel", cascade="all, delete-orphan")


class EvidenceFile(Timestamped, Base):
    __tablename__ = "evidence_files"
    __table_args__ = (UniqueConstraint("panel_id", "shot_type", name="uq_panel_shot_type"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    panel_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("panel_captures.id"), index=True)
    shot_type: Mapped[ShotType] = mapped_column(Enum(ShotType))
    object_key: Mapped[str] = mapped_column(String(500), unique=True)
    original_filename: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int]
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    panel: Mapped[PanelCapture] = relationship(back_populates="uploads")


class Finding(Timestamped, Base):
    __tablename__ = "findings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    inspection_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("inspections.id"), index=True)
    rule_id: Mapped[str] = mapped_column(String(64), index=True)
    requirement: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(32), index=True)
    legal_reference: Mapped[str] = mapped_column(String(300))
    detected_value: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str] = mapped_column(Text)
    recommendation: Mapped[str | None] = mapped_column(Text)
    finding_data: Mapped[dict] = mapped_column(JSON, default=dict)
    inspection: Mapped[Inspection] = relationship(back_populates="findings")


class ProcessingJob(Timestamped, Base):
    __tablename__ = "processing_jobs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    inspection_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("inspections.id"), index=True)
    job_type: Mapped[str] = mapped_column(String(64))
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), default=JobStatus.QUEUED)
    detail: Mapped[str | None] = mapped_column(Text)
    inspection: Mapped[Inspection] = relationship(back_populates="jobs")


class CorrectiveAction(Timestamped, Base):
    """Tracks the correction-period notice issued in a Panchnama.

    Created the first time a Panchnama is generated for an inspection (the
    Panchnama form is where the correction period is set). "Overdue" is
    derived from due_at vs now rather than stored, so it never goes stale.
    """

    __tablename__ = "corrective_actions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    inspection_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("inspections.id"), index=True, unique=True)
    status: Mapped[CorrectiveActionStatus] = mapped_column(
        Enum(CorrectiveActionStatus), default=CorrectiveActionStatus.OPEN, index=True
    )
    correction_period_days: Mapped[int]
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    inspection: Mapped[Inspection] = relationship(back_populates="corrective_actions")
    resolved_by: Mapped[User | None] = relationship()

    @property
    def is_overdue(self) -> bool:
        return self.status == CorrectiveActionStatus.OPEN and self.due_at < datetime.now(UTC)


class Manufacturer(Timestamped, Base):
    """A supervisor-maintained registry, not an auto-deduped one.

    Deliberately no uniqueness constraint on name: two real manufacturers
    can share a name, and forcing uniqueness would fight the manual
    search-then-link-or-create workflow this is built for. Reliable
    offence-counting comes from a human picking the right row, not from a
    DB constraint or fuzzy string matching.
    """

    __tablename__ = "manufacturers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(300), index=True)
    address: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_by: Mapped[User | None] = relationship()
    violation_cases: Mapped[list["ViolationCase"]] = relationship(back_populates="manufacturer")
    compliance_records: Mapped[list["ManufacturerComplianceRecord"]] = relationship(back_populates="manufacturer")


class ViolationCase(Timestamped, Base):
    """A supervisor-confirmed violation on one (inspection, provision) pair,
    tracked through its correction window, escalation, and fine issuance.

    `requirement`/`legal_reference`/`detected_value`/`reason` are a snapshot
    of the Finding at confirmation time, not a foreign key to it: Finding
    rows are bulk-deleted and re-created every time an inspection's
    extracted data is re-saved (see evaluate_and_store), so a FK here would
    either dangle or block that delete. This case is the durable legal
    record; the live Finding is not.
    """

    __tablename__ = "violation_cases"
    __table_args__ = (UniqueConstraint("inspection_id", "rule_id", name="uq_violation_case_inspection_rule"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    inspection_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("inspections.id"), index=True)
    rule_id: Mapped[str] = mapped_column(String(64), index=True)
    requirement: Mapped[str] = mapped_column(String(300))
    legal_reference: Mapped[str] = mapped_column(String(300))
    detected_value: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str] = mapped_column(Text)

    manufacturer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("manufacturers.id"), index=True)
    status: Mapped[ViolationCaseStatus] = mapped_column(
        Enum(ViolationCaseStatus), default=ViolationCaseStatus.AWAITING_RECTIFICATION, index=True
    )
    # The Nth confirmed offence for this manufacturer on this exact rule_id,
    # computed once at confirmation time and never recomputed — it records
    # what was true when it happened, not a live count.
    offence_number: Mapped[int]

    confirmed_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    correction_period_days: Mapped[int]
    window_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    rectified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rectified_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))

    escalated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Free text, deliberately not Numeric: no statutory fine schedule is
    # encoded anywhere in this app. The supervisor decides and enters the
    # amount at issuance time — this column only ever records their input.
    fine_amount: Mapped[str | None] = mapped_column(String(32))
    fine_notes: Mapped[str | None] = mapped_column(Text)
    fine_issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fine_issued_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))

    inspection: Mapped[Inspection] = relationship(back_populates="violation_cases")
    manufacturer: Mapped[Manufacturer] = relationship(back_populates="violation_cases")
    confirmed_by: Mapped[User] = relationship(foreign_keys=[confirmed_by_id])
    rectified_by: Mapped[User | None] = relationship(foreign_keys=[rectified_by_id])
    fine_issued_by: Mapped[User | None] = relationship(foreign_keys=[fine_issued_by_id])
    evidence: Mapped[list["RectificationEvidence"]] = relationship(
        back_populates="case", cascade="all, delete-orphan"
    )

    @property
    def is_overdue(self) -> bool:
        return self.status == ViolationCaseStatus.AWAITING_RECTIFICATION and self.window_due_at < datetime.now(UTC)


class RectificationEvidence(Timestamped, Base):
    """Proof a manufacturer actually fixed the violation — corrected
    artwork photo, re-inspection record, etc. Required before a
    ViolationCase can be closed as rectified; see the /rectify endpoint.

    A new table rather than reusing EvidenceFile: that model is hard-wired
    to panel_id + a two-value ShotType enum with its own unique constraint,
    built for the coin/OCR capture pair, not a free-form correction-proof
    attachment.
    """

    __tablename__ = "rectification_evidence"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    violation_case_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("violation_cases.id"), index=True)
    object_key: Mapped[str] = mapped_column(String(500), unique=True)
    original_filename: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int]
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    note: Mapped[str | None] = mapped_column(Text)
    uploaded_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    case: Mapped[ViolationCase] = relationship(back_populates="evidence")
    uploaded_by: Mapped[User] = relationship()


class ManufacturerComplianceRecord(Timestamped, Base):
    """A supervisor's confirmation that a COMPLIANT inspection's product
    belongs to a specific manufacturer — the positive counterpart to
    ViolationCase. Without this, the public lookup can only ever report
    "confirmed violation" or silence; it can never say "we checked, it was
    clean," because nothing else links a compliant inspection to a
    Manufacturer registry row.

    One per inspection (unique on inspection_id) — an inspection is a
    single settled outcome, not a per-provision record like ViolationCase.
    Manual confirmation only, same reasoning as Manufacturer itself: an
    auto-match by OCR'd name would risk crediting a "clean" record to the
    wrong business, which is the wrong direction to be sloppy in even
    though it isn't a punitive record.
    """

    __tablename__ = "manufacturer_compliance_records"
    __table_args__ = (UniqueConstraint("inspection_id", name="uq_compliance_record_inspection"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    inspection_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("inspections.id"), index=True)
    manufacturer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("manufacturers.id"), index=True)
    confirmed_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    inspection: Mapped[Inspection] = relationship()
    manufacturer: Mapped[Manufacturer] = relationship(back_populates="compliance_records")
    confirmed_by: Mapped[User] = relationship()

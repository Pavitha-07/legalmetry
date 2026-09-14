from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models import (
    CaptureSource,
    CorrectiveActionStatus,
    InspectionStatus,
    JobStatus,
    PanelName,
    ShotType,
    UserRole,
    ViolationCaseStatus,
)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=200)
    password: str = Field(min_length=12, max_length=128)


class UserRead(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class InspectionCreate(BaseModel):
    outlet_name: str | None = Field(default=None, max_length=250)
    outlet_address: str | None = None
    product_name: str | None = Field(default=None, max_length=250)
    product_category: str | None = Field(default=None, max_length=100)
    measure_font_size: bool = True
    measure_net_quantity: bool = False
    measured_net_quantity_value: float | None = None
    measured_net_quantity_unit: str | None = Field(default=None, max_length=20)
    measuring_instrument: str | None = Field(default=None, max_length=200)
    declared_data: dict = Field(default_factory=dict)


class InspectionUpdate(InspectionCreate):
    pass


class PanelCreate(BaseModel):
    panel_name: PanelName
    capture_source: CaptureSource


class EvidenceRead(BaseModel):
    id: UUID
    shot_type: ShotType
    original_filename: str
    content_type: str
    size_bytes: int
    sha256: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PanelRead(BaseModel):
    id: UUID
    panel_name: PanelName
    capture_source: CaptureSource
    uploads: list[EvidenceRead]

    model_config = {"from_attributes": True}


class FindingRead(BaseModel):
    id: UUID
    rule_id: str
    requirement: str
    status: str
    legal_reference: str
    detected_value: str | None
    reason: str
    recommendation: str | None

    model_config = {"from_attributes": True}


class ProcessingJobRead(BaseModel):
    id: UUID
    job_type: str
    status: JobStatus
    detail: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InspectionRead(BaseModel):
    id: UUID
    reference: str
    status: InspectionStatus
    outlet_name: str | None
    outlet_address: str | None
    product_name: str | None
    product_category: str | None
    measure_font_size: bool
    measure_net_quantity: bool
    measured_net_quantity_value: float | None
    measured_net_quantity_unit: str | None
    measuring_instrument: str | None
    declared_data: dict
    extracted_data: dict
    created_at: datetime
    updated_at: datetime
    panels: list[PanelRead] = []
    findings: list[FindingRead] = []
    jobs: list[ProcessingJobRead] = []

    model_config = {"from_attributes": True}


class ExtractedFactsUpdate(BaseModel):
    extracted_data: dict


class DashboardSummary(BaseModel):
    district_name: str
    total_inspections: int
    draft: int
    processing: int
    needs_review: int
    compliant: int
    violation: int
    completed_reports: int
    violation_by_rule: list["ViolationByRule"] = []
    inspections_by_category: list["CategorySummary"] = []
    violation_reports: list[InspectionRead] = []
    recent_inspections: list[InspectionRead]
    weekly_trend: list["WeeklyTrendPoint"] = []
    corrective_actions: list["CorrectiveActionRead"] = []
    open_corrective_actions: int = 0
    overdue_corrective_actions: int = 0
    violation_cases: list["ViolationCaseRead"] = []
    escalation_queue: list["ViolationCaseRead"] = []
    open_violation_cases: int = 0
    overdue_violation_cases: int = 0
    pending_fine_recommendations: int = 0


class ViolationByRule(BaseModel):
    rule_id: str
    requirement: str
    count: int


class CategorySummary(BaseModel):
    category: str
    total_inspections: int
    violations: int


class WeeklyTrendPoint(BaseModel):
    week_start: date
    total: int
    violations: int


class CorrectiveActionInspectionSummary(BaseModel):
    id: UUID
    reference: str
    product_name: str | None
    outlet_name: str | None

    model_config = {"from_attributes": True}


class CorrectiveActionRead(BaseModel):
    id: UUID
    status: CorrectiveActionStatus
    correction_period_days: int
    issued_at: datetime
    due_at: datetime
    resolved_at: datetime | None
    is_overdue: bool
    inspection: CorrectiveActionInspectionSummary

    model_config = {"from_attributes": True}


class EvidenceDownloadUrl(BaseModel):
    url: str
    expires_in_seconds: int = 600


class FindingReviewAction(BaseModel):
    action: str = Field(pattern="^(confirm|reject)$")
    note: str | None = Field(default=None, max_length=500)


class WitnessEntry(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    designation: str | None = Field(default=None, max_length=200)
    address: str | None = Field(default=None, max_length=500)


class PanchnamaRequest(BaseModel):
    witness_one: WitnessEntry
    witness_two: WitnessEntry
    place_of_search: str = Field(min_length=2, max_length=300)
    officer_designation: str | None = Field(default=None, max_length=200)
    correction_period_days: int = Field(default=30, ge=1, le=180)


class ManufacturerCreate(BaseModel):
    name: str = Field(min_length=2, max_length=300)
    address: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=2000)


class ManufacturerRead(BaseModel):
    id: UUID
    name: str
    address: str | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConfirmViolationRequest(BaseModel):
    manufacturer_id: UUID | None = None
    new_manufacturer: ManufacturerCreate | None = None
    correction_period_days: int = Field(default=15, ge=1, le=180)


class RectificationEvidenceRead(BaseModel):
    id: UUID
    original_filename: str
    content_type: str
    size_bytes: int
    sha256: str
    note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ViolationCaseInspectionSummary(BaseModel):
    id: UUID
    reference: str
    product_name: str | None
    outlet_name: str | None

    model_config = {"from_attributes": True}


class ViolationCaseRead(BaseModel):
    id: UUID
    inspection_id: UUID
    rule_id: str
    requirement: str
    legal_reference: str
    detected_value: str | None
    reason: str
    manufacturer: ManufacturerRead
    status: ViolationCaseStatus
    offence_number: int
    confirmed_at: datetime
    correction_period_days: int
    window_due_at: datetime
    is_overdue: bool
    rectified_at: datetime | None
    escalated_at: datetime | None
    fine_amount: str | None
    fine_notes: str | None
    fine_issued_at: datetime | None
    evidence: list[RectificationEvidenceRead] = []
    inspection: ViolationCaseInspectionSummary

    model_config = {"from_attributes": True}


class RectifyCaseRequest(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


class IssueFineRequest(BaseModel):
    fine_amount: str = Field(min_length=1, max_length=32)
    fine_notes: str | None = Field(default=None, max_length=2000)


class PublicManufacturerComplianceRead(BaseModel):
    """The public, no-login retailer lookup. Deliberately minimal: no
    evidence, no inspector notes, no provision-level detail, no fine
    amounts — just enough to answer "should I be cautious buying from this
    manufacturer," plus the counts needed to distinguish a clean record
    from one this office simply hasn't looked at.
    """

    id: UUID
    name: str
    address: str | None
    unresolved_count: int
    resolved_count: int
    clean_inspection_count: int


class PublicManufacturerLookupResponse(BaseModel):
    results: list[PublicManufacturerComplianceRead]
    # Always populated, including on an empty result — a retailer must never
    # read "no results" as "verified compliant." This office only knows
    # about manufacturers it has confirmed a violation against, or has
    # explicitly logged a clean inspection for; a name that never appears
    # here has simply never been checked either way.
    disclaimer: str


class ConfirmComplianceRequest(BaseModel):
    manufacturer_id: UUID | None = None
    new_manufacturer: ManufacturerCreate | None = None


class ManufacturerComplianceRecordRead(BaseModel):
    id: UUID
    inspection_id: UUID
    manufacturer: ManufacturerRead
    confirmed_at: datetime

    model_config = {"from_attributes": True}

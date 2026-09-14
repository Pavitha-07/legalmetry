import re
import sys
from pathlib import Path

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import Finding, Inspection, InspectionStatus

RULE_ENGINE_PATH = Path("/rule-engine")
if not RULE_ENGINE_PATH.exists():
    RULE_ENGINE_PATH = Path(__file__).resolve().parents[3] / "rule-engine"
if str(RULE_ENGINE_PATH) not in sys.path:
    sys.path.insert(0, str(RULE_ENGINE_PATH))

from engine import run_compliance_check  # noqa: E402


# ---------------------------------------------------------------------------
# Declared-vs-extracted mismatch helpers
# ---------------------------------------------------------------------------

def _normalise(text: str) -> str:
    """Lowercase, collapse whitespace, strip punctuation for fuzzy comparison."""
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _texts_match(declared: str, extracted: str) -> bool:
    """Return True if the texts are close enough to not flag a mismatch.

    Strategy: one must be a substring of the other after normalisation, or
    they must share at least half their words (handles abbreviated vs full
    names, e.g. "Hindustan Unilever" matching "Hindustan Unilever Limited").
    """
    a = _normalise(declared)
    b = _normalise(extracted)
    if not a or not b:
        return True  # Can't compare — treat as matching to avoid false alarms.
    if a in b or b in a:
        return True
    words_a = set(a.split())
    words_b = set(b.split())
    # Strip words that are too generic to carry matching weight on their own:
    # legal suffixes, articles, common commodity nouns, and single characters.
    stopwords = {
        "of", "by", "the", "and", "or", "for", "a", "an",
        "ltd", "pvt", "limited", "co", "inc", "corp", "industries",
        "oil", "water", "salt", "sugar", "flour", "milk", "tea", "rice",
        "product", "products", "goods", "item",
    }
    words_a = {w for w in words_a - stopwords if len(w) > 1}
    words_b = {w for w in words_b - stopwords if len(w) > 1}
    if not words_a or not words_b:
        return True
    overlap = words_a & words_b
    # Match if MORE than half of the smaller set's meaningful words appear in
    # the other.  Strictly greater than avoids a single shared non-stop word
    # (e.g. "refined") from falsely uniting unrelated products.
    min_len = min(len(words_a), len(words_b))
    return len(overlap) / min_len > 0.5


def _mismatch_findings(inspection: Inspection) -> list[dict]:
    """Compare inspector-declared fields against OCR-extracted facts.

    Returns a list of finding dicts (same shape as rule-engine check dicts)
    for any fields where the declared and extracted values diverge.

    These are surfaced as NEEDS_REVIEW — the inspector must confirm whether
    the OCR read the label correctly or the declared data was wrong.
    """
    findings: list[dict] = []
    declared = inspection.declared_data or {}
    extracted = inspection.extracted_data or {}

    # 1. Product name
    # The inspector's declared product name is the top-level column; it may
    # also appear in declared_data under "product_name".
    declared_product = (
        str(declared.get("product_name") or inspection.product_name or "").strip()
    )
    extracted_product = str(extracted.get("product_name") or "").strip()

    if declared_product and extracted_product:
        if not _texts_match(declared_product, extracted_product):
            findings.append({
                "rule_id": "LM-MM-001",
                "requirement": "Declared product name matches label",
                "status": "NEEDS_REVIEW",
                "legal_reference": (
                    "Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6: "
                    "commodity identity must match the declared description."
                ),
                "detected_value": extracted_product,
                "reason": (
                    f"Inspector declared product name '{declared_product}' but OCR read "
                    f"'{extracted_product}'. Verify whether the label matches the declared "
                    "commodity identity."
                ),
                "recommendation": (
                    "Confirm the OCR reading is correct and the label matches the declared product."
                ),
            })

    # 2. Manufacturer name
    declared_mfr_raw = declared.get("manufacturer") or {}
    declared_mfr = str(
        declared_mfr_raw.get("name") if isinstance(declared_mfr_raw, dict)
        else declared_mfr_raw
    ).strip()

    extracted_mfr_raw = extracted.get("manufacturer") or {}
    extracted_mfr = str(
        extracted_mfr_raw.get("name") if isinstance(extracted_mfr_raw, dict)
        else extracted_mfr_raw
    ).strip()

    if declared_mfr and declared_mfr != "None" and extracted_mfr and extracted_mfr != "None":
        if not _texts_match(declared_mfr, extracted_mfr):
            findings.append({
                "rule_id": "LM-MM-002",
                "requirement": "Declared manufacturer matches label",
                "status": "NEEDS_REVIEW",
                "legal_reference": (
                    "Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6: "
                    "manufacturer/packer details must match the declared information."
                ),
                "detected_value": extracted_mfr,
                "reason": (
                    f"Inspector declared manufacturer '{declared_mfr}' but OCR read "
                    f"'{extracted_mfr}'. Verify whether the label matches the declared "
                    "manufacturer details."
                ),
                "recommendation": (
                    "Confirm the OCR reading is correct and the label matches the declared manufacturer."
                ),
            })

    return findings


# ---------------------------------------------------------------------------
# Main evaluation entry point
# ---------------------------------------------------------------------------

def evaluate_and_store(db: Session, inspection: Inspection) -> dict:
    if not inspection.extracted_data:
        inspection.status = InspectionStatus.NEEDS_REVIEW
        return {"overall_status": "NEEDS_REVIEW", "reason": "No extracted facts are available yet."}

    product_data = dict(inspection.extracted_data)
    product_data.setdefault("product_name", inspection.product_name)
    product_data.setdefault("product_category", inspection.product_category)
    # A physical scale reading, entered directly by the officer — not OCR
    # output, so it lives on the Inspection row itself rather than
    # extracted_data. net_quantity_tolerance.py is NOT_APPLICABLE unless
    # this was actually recorded.
    if inspection.measure_net_quantity and inspection.measured_net_quantity_value is not None:
        product_data["net_quantity_measurement"] = {
            "status": "measured",
            "value": inspection.measured_net_quantity_value,
            "unit": inspection.measured_net_quantity_unit,
            "instrument": inspection.measuring_instrument,
        }
    else:
        product_data["net_quantity_measurement"] = {"status": "not_requested"}
    result = run_compliance_check(product_data)

    # OCR uncertainty cannot safely establish a legal absence. Route automatic
    # failures to review when the underlying English OCR confidence is low.
    if float(product_data.get("ocr_confidence") or 1.0) < 0.85:
        for check in result["checks"]:
            if check["status"] == "FAIL":
                check["status"] = "NEEDS_REVIEW"
                check["reason"] += " OCR confidence is below the automatic-decision threshold."
        result["overall_status"] = "NEEDS_REVIEW"

    # Append declared-vs-extracted mismatch findings. These are generated
    # separately from the rule engine so they appear as a distinct finding
    # category in the UI and dashboard.
    mismatch_checks = _mismatch_findings(inspection)
    result["checks"].extend(mismatch_checks)

    # Re-derive overall status including any new mismatch findings.
    all_statuses = {c["status"] for c in result["checks"]}
    if "FAIL" in all_statuses:
        result["overall_status"] = "FAIL"
    elif "NEEDS_REVIEW" in all_statuses:
        result["overall_status"] = "NEEDS_REVIEW"

    db.execute(delete(Finding).where(Finding.inspection_id == inspection.id))
    for check in result["checks"]:
        db.add(Finding(inspection_id=inspection.id, finding_data=check, **check))

    overall = result["overall_status"]
    inspection.status = {
        "PASS": InspectionStatus.COMPLIANT,
        "FAIL": InspectionStatus.VIOLATION,
        "NEEDS_REVIEW": InspectionStatus.NEEDS_REVIEW,
    }[overall]
    return result

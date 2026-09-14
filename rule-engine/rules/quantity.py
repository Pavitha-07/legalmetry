from .base import RuleResult, Status

RULE_ID = "LM-PC-003"
REQUIREMENT = "Net quantity"
LEGAL_REF = "Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6"

RECOGNIZED_UNITS = {"g", "kg", "ml", "l", "cm", "m", "piece", "pieces", "pair", "set", "number"}


def check(data: dict) -> RuleResult:
    qty = data.get("net_quantity")

    if not qty or not isinstance(qty, dict):
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.FAIL,
            legal_reference=LEGAL_REF, detected_value=None,
            reason="Net quantity not detected.",
            recommendation="Declare net quantity using a standard unit of weight, measure, or number.",
        )

    value = qty.get("value")
    unit = (qty.get("unit") or "").strip().lower()

    if value is None or value == "":
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.FAIL,
            legal_reference=LEGAL_REF, detected_value=None,
            reason="Net quantity numeric value not detected.",
            recommendation="Declare a clear numeric net quantity value.",
        )

    if not unit:
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NEEDS_REVIEW,
            legal_reference=LEGAL_REF, detected_value=str(value),
            reason="Numeric quantity detected but unit could not be confidently determined.",
            recommendation="Verify the unit of measure printed on the package.",
        )

    if unit not in RECOGNIZED_UNITS:
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NEEDS_REVIEW,
            legal_reference=LEGAL_REF, detected_value=f"{value} {unit}",
            reason=f"Unit '{unit}' is not among commonly recognized units; needs manual verification.",
            recommendation="Confirm the declared unit is a valid standard unit.",
        )

    return RuleResult(
        rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.PASS,
        legal_reference=LEGAL_REF, detected_value=f"{value} {unit}",
        reason="Net quantity and recognized unit detected.",
    )
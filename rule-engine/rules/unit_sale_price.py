from .base import RuleResult, Status

RULE_ID = "LM-PC-009"
REQUIREMENT = "Unit sale price"
LEGAL_REF = "Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6"

EXPECTED_UNIT = {
    "g": "g", "kg": "kg", "ml": "ml", "l": "litre", "cm": "cm", "m": "metre",
}


def _expected_unit_for(quantity: dict) -> str | None:
    if not quantity:
        return None
    unit = (quantity.get("unit") or "").lower()
    value = quantity.get("value")
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None

    if unit == "g":
        return "g" if value < 1000 else "kg"
    if unit == "kg":
        return "g" if value < 1 else "kg"
    if unit == "ml":
        return "ml" if value < 1000 else "litre"
    if unit == "l":
        return "ml" if value < 1 else "litre"
    if unit == "cm":
        return "cm" if value < 100 else "metre"
    if unit == "m":
        return "cm" if value < 1 else "metre"
    return None


def check(data: dict) -> RuleResult:
    quantity = data.get("net_quantity")
    unit_price = data.get("unit_sale_price")
    expected = _expected_unit_for(quantity or {})

    if not unit_price or not str(unit_price).strip():
        if expected is None:
            return RuleResult(
                rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NEEDS_REVIEW,
                legal_reference=LEGAL_REF, detected_value=None,
                reason="Unit sale price not detected and expected format could not be determined.",
                recommendation="Declare unit sale price if applicable to this commodity.",
            )
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.FAIL,
            legal_reference=LEGAL_REF, detected_value=None,
            reason=f"Unit sale price not detected; expected format is price per {expected}.",
            recommendation=f"Declare unit sale price as ₹X per {expected}.",
        )

    if expected and expected not in str(unit_price).lower():
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NEEDS_REVIEW,
            legal_reference=LEGAL_REF, detected_value=str(unit_price),
            reason=f"Unit sale price detected but does not clearly match expected unit '{expected}'.",
            recommendation=f"Verify unit sale price is expressed per {expected}.",
        )

    return RuleResult(
        rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.PASS,
        legal_reference=LEGAL_REF, detected_value=str(unit_price),
        reason="Unit sale price detected and consistent with declared quantity.",
    )
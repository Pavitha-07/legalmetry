from .base import RuleResult, Status

RULE_ID = "LM-PC-004"
REQUIREMENT = "Manufacture/pack/import date"
LEGAL_REF = "Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6"


def check(data: dict) -> RuleResult:
    date = data.get("manufacture_date")

    if not date or not str(date).strip():
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.FAIL,
            legal_reference=LEGAL_REF, detected_value=None,
            reason="Month/year of manufacture, packing, or import not detected.",
            recommendation="Declare the month and year of manufacture/packing/import.",
        )

    return RuleResult(
        rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.PASS,
        legal_reference=LEGAL_REF, detected_value=str(date),
        reason="Manufacture/pack/import date detected.",
    )
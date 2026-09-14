from .base import RuleResult, Status

RULE_ID = "LM-PC-001"
REQUIREMENT = "Common or generic name"
LEGAL_REF = "Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6"


def check(data: dict) -> RuleResult:
    name = data.get("product_name")

    if not name or not str(name).strip():
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.FAIL,
            legal_reference=LEGAL_REF, detected_value=None,
            reason="No product/common name detected on the package.",
            recommendation="Ensure the common or generic name of the commodity is printed clearly.",
        )

    return RuleResult(
        rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.PASS,
        legal_reference=LEGAL_REF, detected_value=name,
        reason="Common/generic commodity name detected.",
    )
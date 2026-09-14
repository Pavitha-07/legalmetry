# rules/pack_size.py
from .base import RuleResult, Status

RULE_ID = "LM-PC-011"
REQUIREMENT = "Standard pack size"
LEGAL_REF = "Legal Metrology (Packaged Commodities) Rules, 2011 — Second Schedule"


def check(data: dict) -> RuleResult:
    raw_text = (data.get("raw_text") or "").lower()

    if "not a standard pack size" in raw_text:
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NEEDS_REVIEW,
            legal_reference=LEGAL_REF, detected_value="Non-standard pack size declared",
            reason="Package explicitly declares it is not a standard pack size; commodity schedule not yet implemented for full validation.",
        )

    return RuleResult(
        rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NOT_APPLICABLE,
        legal_reference=LEGAL_REF, detected_value=None,
        reason=(
            "Standard pack-size validation against the Second Schedule is not yet "
            "implemented in this MVP, and no non-standard pack size was declared on the label."
        ),
    )
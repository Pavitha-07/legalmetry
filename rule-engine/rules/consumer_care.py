from .base import RuleResult, Status

RULE_ID = "LM-PC-006"
REQUIREMENT = "Consumer care details"
LEGAL_REF = "Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6"


def check(data: dict) -> RuleResult:
    care = data.get("consumer_care") or {}
    phone = care.get("phone") if isinstance(care, dict) else None
    email = care.get("email") if isinstance(care, dict) else None

    if not phone and not email:
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.FAIL,
            legal_reference=LEGAL_REF, detected_value=None,
            reason="No consumer care phone number or email detected.",
            recommendation="Add a consumer care phone number, email, or helpline.",
        )

    detected = ", ".join(v for v in (phone, email) if v)
    return RuleResult(
        rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.PASS,
        legal_reference=LEGAL_REF, detected_value=detected,
        reason="Consumer care contact information detected.",
    )
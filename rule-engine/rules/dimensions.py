# rules/dimensions.py
from .base import RuleResult, Status

RULE_ID = "LM-PC-010"
REQUIREMENT = "Dimensions"
LEGAL_REF = "Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6"

DIMENSION_RELEVANT_CATEGORIES = {"textile", "furniture", "flooring", "cable", "pipe"}


def check(data: dict) -> RuleResult:
    category = (data.get("product_category") or "").strip().lower()
    dimensions = data.get("dimensions")

    if not category:
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NEEDS_REVIEW,
            legal_reference=LEGAL_REF, detected_value=dimensions,
            reason="Product category unknown; cannot determine if dimensions are required.",
        )

    if category not in DIMENSION_RELEVANT_CATEGORIES:
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NOT_APPLICABLE,
            legal_reference=LEGAL_REF, detected_value=dimensions,
            reason=f"Dimensions not generally relevant for category '{category}'.",
        )

    if not dimensions:
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.FAIL,
            legal_reference=LEGAL_REF, detected_value=None,
            reason="Dimensions required for this category but not detected.",
            recommendation="Declare relevant physical dimensions.",
        )

    return RuleResult(
        rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.PASS,
        legal_reference=LEGAL_REF, detected_value=str(dimensions),
        reason="Dimensions detected.",
    )
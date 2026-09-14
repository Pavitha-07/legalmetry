from .base import RuleResult, Status

RULE_ID = "LM-PC-008"
REQUIREMENT = "Best before / use by"
LEGAL_REF = "Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6"

# Categories generally understood to require a best-before/use-by declaration.
PERISHABLE_CATEGORIES = {"food", "beverage", "cosmetic", "pharmaceutical", "confectionery"}


def check(data: dict) -> RuleResult:
    category = (data.get("product_category") or "").strip().lower()
    best_before = data.get("best_before")

    if not category:
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NEEDS_REVIEW,
            legal_reference=LEGAL_REF, detected_value=best_before,
            reason="Product category could not be determined, so applicability is unclear.",
            recommendation="Verify whether this commodity category requires a best-before declaration.",
        )

    if category not in PERISHABLE_CATEGORIES:
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NOT_APPLICABLE,
            legal_reference=LEGAL_REF, detected_value=best_before,
            reason=f"Category '{category}' does not generally require a best-before declaration.",
        )

    if not best_before or not str(best_before).strip():
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.FAIL,
            legal_reference=LEGAL_REF, detected_value=None,
            reason=f"Category '{category}' requires best-before/use-by but none was detected.",
            recommendation="Declare best-before or use-by information.",
        )

    return RuleResult(
        rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.PASS,
        legal_reference=LEGAL_REF, detected_value=str(best_before),
        reason="Best-before/use-by declaration detected.",
    )
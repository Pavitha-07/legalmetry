"""Which rule violations are eligible for an improvement-notice / correction
window under the Legal Metrology (Packaged Commodities) Rules, 2011, as
opposed to a provision that must be actioned some other way.

This is a legal determination, not a code decision — every entry below
except LM-PC-011 defaults to True as a PLACEHOLDER so the confirm-violation
workflow is demonstrable end-to-end. This table needs a legal/domain
sign-off pass before being relied on for a real case, the same way no
statutory fine amount is hardcoded anywhere in this app.

Kept as a plain backend-side lookup rather than a field on RuleResult or
Finding: eligibility is a static fact per rule_id, not something that needs
to flow through the rule engine's per-check dict, and evaluate_and_store
unpacks that dict directly as Finding(**check) — adding an unknown key
there would break on an unexpected keyword argument.
"""

IMPROVEMENT_NOTICE_ELIGIBLE_RULES: dict[str, bool] = {
    "LM-PC-001": True,  # product_name
    "LM-PC-002": True,  # manufacturer
    "LM-PC-003": True,  # quantity
    "LM-PC-004": True,  # date
    "LM-PC-005": True,  # mrp
    "LM-PC-006": True,  # consumer_care
    "LM-PC-007": True,  # country_of_origin
    "LM-PC-008": True,  # best_before
    "LM-PC-009": True,  # unit_sale_price
    "LM-PC-010": True,  # dimensions
    "LM-PC-011": False,  # pack_size — rule module is a stub, never a real FAIL
    "LM-PC-012": True,  # font_height
    "LM-PC-013": True,  # net_quantity_tolerance
}


def is_improvement_notice_eligible(rule_id: str) -> bool:
    # Unknown rule_id (e.g. the LM-MM-* declared/OCR mismatch checks, which
    # are human-judgment findings, not rule-engine FAILs) defaults closed.
    return IMPROVEMENT_NOTICE_ELIGIBLE_RULES.get(rule_id, False)

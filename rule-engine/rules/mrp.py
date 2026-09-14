from .base import RuleResult, Status

RULE_ID = "LM-PC-005"
REQUIREMENT = "MRP / retail sale price"
LEGAL_REF = "Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6 & 18"


def check(data: dict) -> RuleResult:
    mrp = data.get("mrp")

    if not mrp or not isinstance(mrp, dict):
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.FAIL,
            legal_reference=LEGAL_REF, detected_value=None,
            reason="MRP/retail sale price not detected.",
            recommendation="Declare MRP clearly, e.g. 'MRP ₹320 (Incl. of all taxes)'.",
        )

    value = mrp.get("value")
    currency = (mrp.get("currency") or "").upper()
    raw = mrp.get("raw")

    if value is None or value == "":
        if raw:
            # An MRP marker was detected but the numeric value couldn't be
            # confidently parsed (e.g. garbled OCR like "3?0") — this is
            # ambiguity, not absence, so it needs human review rather than
            # an automatic FAIL.
            return RuleResult(
                rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NEEDS_REVIEW,
                legal_reference=LEGAL_REF, detected_value=raw,
                reason="MRP marker detected but numeric value could not be confidently parsed from OCR output.",
                recommendation="Manually verify the MRP printed on the package.",
            )
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.FAIL,
            legal_reference=LEGAL_REF, detected_value=None,
            reason="MRP numeric value not detected.",
            recommendation="Ensure MRP numeric value is printed clearly and legibly.",
        )

    if currency and currency not in {"INR", "₹", "RS", "RS."}:
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NEEDS_REVIEW,
            legal_reference=LEGAL_REF, detected_value=f"{value} {currency}",
            reason="Currency could not be confidently confirmed as INR.",
            recommendation="Verify the MRP currency printed on the package.",
        )

    return RuleResult(
        rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.PASS,
        legal_reference=LEGAL_REF, detected_value=f"₹{value}",
        reason="MRP clearly identified.",
    )
from .base import RuleResult, Status

RULE_ID = "LM-PC-007"
REQUIREMENT = "Country of origin (imported products)"
LEGAL_REF = "Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6(1)(a)"


def check(data: dict) -> RuleResult:
    origin_status = (data.get("product_origin") or "").strip().lower()
    country = data.get("country_of_origin")

    if origin_status in ("india", "manufactured in india", "domestic"):
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NOT_APPLICABLE,
            legal_reference=LEGAL_REF, detected_value=country,
            reason="Product identified as manufactured in India; country-of-origin declaration not required.",
        )

    if origin_status in ("imported", "import"):
        if not country or not str(country).strip():
            return RuleResult(
                rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.FAIL,
                legal_reference=LEGAL_REF, detected_value=None,
                reason="Product identified as imported but country of origin not declared.",
                recommendation="Declare the country of origin for imported products.",
            )
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.PASS,
            legal_reference=LEGAL_REF, detected_value=country,
            reason="Country of origin declared for imported product.",
        )

    return RuleResult(
        rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NEEDS_REVIEW,
        legal_reference=LEGAL_REF, detected_value=country,
        reason="Could not determine whether the product is imported or domestically manufactured.",
        recommendation="Verify whether this product is imported to assess this requirement.",
    )
from rules import (
    product_name,
    manufacturer,
    quantity,
    mrp,
    date,
    consumer_care,
    country_of_origin,
    best_before,
    unit_sale_price,
    dimensions,
    pack_size,
    font_height,
    net_quantity_tolerance,
)
from rules.base import Status

RULE_MODULES = [
    product_name,
    manufacturer,
    quantity,
    mrp,
    date,
    consumer_care,
    country_of_origin,
    best_before,
    unit_sale_price,
    dimensions,
    pack_size,
    font_height,
    net_quantity_tolerance,
]

DISCLAIMER = (
    "This prototype checks selected package declarations based on the "
    "implemented Legal Metrology rules. Results should be verified against "
    "the latest applicable regulations and product-specific requirements."
)


def run_compliance_check(product_data: dict) -> dict:
    results = [module.check(product_data) for module in RULE_MODULES]

    passed = sum(1 for r in results if r.status == Status.PASS)
    failed = sum(1 for r in results if r.status == Status.FAIL)
    needs_review = sum(1 for r in results if r.status == Status.NEEDS_REVIEW)
    not_applicable = sum(1 for r in results if r.status == Status.NOT_APPLICABLE)

    applicable = passed + failed + needs_review
    score = round((passed / applicable) * 100, 1) if applicable > 0 else None

    if failed > 0:
        overall_status = "FAIL"
    elif needs_review > 0:
        overall_status = "NEEDS_REVIEW"
    else:
        overall_status = "PASS"

    return {
        "overall_status": overall_status,
        "score": score,
        "summary": {
            "passed": passed,
            "failed": failed,
            "needs_review": needs_review,
            "not_applicable": not_applicable,
        },
        "checks": [r.to_dict() for r in results],
        "disclaimer": DISCLAIMER,
    }

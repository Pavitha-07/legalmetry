"""Font-height evidence check for package declarations.

The app measures OCR polygons against an automatically detected ₹10 coin.
It only returns an automatic decision when the paired images have matching
pixel dimensions and OCR confidence is sufficiently high; otherwise a human
must review the evidence.
"""

from .base import RuleResult, Status

RULE_ID = "LM-PC-012"
REQUIREMENT = "Minimum declaration letter/numeral height"
LEGAL_REF = "Legal Metrology (Packaged Commodities) Rules, 2011 — configured package declaration font-height requirement"


def check(data: dict) -> RuleResult:
    method = str(data.get("printing_method") or "normal").strip().lower()
    minimum_mm = 2.0 if method in {"blown", "formed", "molded", "moulded", "embossed", "perforated"} else 1.0
    measurement = data.get("font_measurements") or {}

    if measurement.get("status") == "not_requested":
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NOT_APPLICABLE,
            legal_reference=LEGAL_REF, detected_value=None,
            reason="Font-size measurement was not requested for this inspection.",
        )

    if measurement.get("status") != "calibrated":
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NEEDS_REVIEW,
            legal_reference=LEGAL_REF, detected_value=None,
            reason="No reliable ₹10 coin calibration was available for font-height measurement.",
            recommendation="Retake the paired photos with the coin fully visible and both photos at the same distance/zoom.",
        )

    pair_check = measurement.get("pair_scale_check") or {}
    if not pair_check.get("dimensions_match"):
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NEEDS_REVIEW,
            legal_reference=LEGAL_REF, detected_value=None,
            reason="Calibration and OCR images do not have matching pixel dimensions, so the coin scale cannot be safely transferred.",
            recommendation="Retake both paired photos at the same distance, zoom, and resolution.",
        )

    if float(data.get("ocr_confidence") or 0.0) < 0.85:
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NEEDS_REVIEW,
            legal_reference=LEGAL_REF, detected_value=None,
            reason="OCR confidence is below the automatic font-height decision threshold.",
            recommendation="Verify the measurement manually or retake a sharper OCR photo.",
        )

    values = [item.get("height_mm") for item in measurement.get("measurements", []) if isinstance(item.get("height_mm"), (int, float))]
    if not values:
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NEEDS_REVIEW,
            legal_reference=LEGAL_REF, detected_value=None,
            reason="No high-confidence OCR text regions were available for font-height measurement.",
            recommendation="Retake a sharper image of the package declarations.",
        )

    observed_minimum = min(values)
    method_label = "special printing" if minimum_mm == 2.0 else "normal printing"
    if observed_minimum < minimum_mm:
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.FAIL,
            legal_reference=LEGAL_REF, detected_value=f"{observed_minimum:.3f} mm (minimum {minimum_mm:.1f} mm)",
            reason=f"Smallest measured high-confidence text is below the {minimum_mm:.1f} mm minimum for {method_label}.",
            recommendation="Increase the declaration text height or verify the measurement manually.",
        )

    return RuleResult(
        rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.PASS,
        legal_reference=LEGAL_REF, detected_value=f"{observed_minimum:.3f} mm (minimum {minimum_mm:.1f} mm)",
        reason=f"Measured high-confidence text meets the {minimum_mm:.1f} mm minimum for {method_label}.",
    )

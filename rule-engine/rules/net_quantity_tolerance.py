"""Physical net-quantity verification against the First Schedule's maximum
permissible error (MPE) tables. A camera cannot answer "does this package
actually contain what it claims" — that's a real-scale measurement, entered
by the officer, not something OCR extracts. This rule only ever runs on
that manual measurement; if none was recorded, it's NOT_APPLICABLE, same
as font-height is when no coin calibration was requested.

Tolerance is stored as structured band data (this module), not hardcoded
per-call arithmetic scattered through the check function, so the actual
legal figures are auditable in one place.
"""

import math

from .base import RuleResult, Status

RULE_ID = "LM-PC-013"
REQUIREMENT = "Net quantity within maximum permissible error"
LEGAL_REF = "Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 22, First Schedule"

WEIGHT_UNITS = {"g", "kg"}
VOLUME_UNITS = {"ml", "l"}
LENGTH_UNITS = {"cm", "m"}
COUNT_UNITS = {"piece", "pieces", "pair", "set", "number"}

# First Schedule, Table I (Rule 2(e), Rule 22): maximum permissible error on
# net quantities declared by weight or volume, normalized to grams/millilitres.
# Each band uses EITHER a percentage of declared quantity OR a fixed g/ml
# value, never both — exactly as printed in the gazette table.
#
# Boundary convention (not made fully explicit in the gazette excerpt):
# each row's upper bound is inclusive of that row ("up to 50" -> declared <= 50
# uses row (i); "50 to 100" -> 50 < declared <= 100 uses row (ii)). This is a
# reasonable reading, not a verified legal ruling on tie-breaking at exact
# band boundaries.
WEIGHT_VOLUME_BANDS_G_ML: list[tuple[float, float | None, float | None]] = [
    (50, 9.0, None),
    (100, None, 4.5),
    (200, 4.5, None),
    (300, None, 9.0),
    (500, 3.0, None),
    (1000, None, 15.0),
    (10000, 1.5, None),
    (15000, None, 150.0),
    (math.inf, 1.0, None),
]

# First Schedule, Table II: length/area declared quantities, normalized to
# metres / square metres. Number is a flat 2% regardless of declared count.
LENGTH_BANDS_M: list[tuple[float, float]] = [(10, 2.0), (math.inf, 1.0)]
AREA_BANDS_SQM: list[tuple[float, float]] = [(10, 4.0), (math.inf, 1.0)]
NUMBER_PERCENT = 2.0


def _to_grams_or_ml(value: float, unit: str) -> float:
    if unit in ("kg", "l"):
        return value * 1000
    return value  # g or ml already


def _to_metres(value: float, unit: str) -> float:
    return value / 100 if unit == "cm" else value


def _weight_volume_tolerance(declared_g_ml: float) -> float:
    for upper, percent, fixed in WEIGHT_VOLUME_BANDS_G_ML:
        if declared_g_ml <= upper:
            tolerance = (declared_g_ml * percent / 100) if percent is not None else fixed
            # Sub-rule 2's rounding: nearest tenth up to 1000 g/ml, next
            # whole unit above that.
            return round(tolerance, 1) if declared_g_ml <= 1000 else math.ceil(tolerance)
    return 0.0  # unreachable — last band's upper bound is inf


def _percent_tolerance(declared: float, bands: list[tuple[float, float]]) -> float:
    for upper, percent in bands:
        if declared <= upper:
            return declared * percent / 100
    return 0.0  # unreachable


def check(data: dict) -> RuleResult:
    measurement = data.get("net_quantity_measurement") or {}
    quantity = data.get("net_quantity")

    if measurement.get("status") != "measured":
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NOT_APPLICABLE,
            legal_reference=LEGAL_REF, detected_value=None,
            reason="Physical weight/volume verification was not performed for this inspection.",
        )

    if not quantity or not isinstance(quantity, dict) or quantity.get("value") in (None, ""):
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NEEDS_REVIEW,
            legal_reference=LEGAL_REF, detected_value=None,
            reason="A physical measurement was recorded, but no declared net quantity was detected to compare it against.",
            recommendation="Verify the declared net quantity on the label and re-check manually.",
        )

    try:
        declared_value = float(quantity["value"])
        measured_value = float(measurement["value"])
    except (TypeError, ValueError, KeyError):
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NEEDS_REVIEW,
            legal_reference=LEGAL_REF, detected_value=str(measurement.get("value")),
            reason="Declared or measured quantity could not be parsed as a number.",
        )

    declared_unit = str(quantity.get("unit") or "").strip().lower()
    measured_unit = str(measurement.get("unit") or declared_unit).strip().lower()
    if declared_unit != measured_unit:
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NEEDS_REVIEW,
            legal_reference=LEGAL_REF, detected_value=f"{measured_value} {measured_unit}",
            reason=f"Declared unit '{declared_unit}' and measured unit '{measured_unit}' do not match; verify manually.",
        )

    if declared_unit in WEIGHT_UNITS or declared_unit in VOLUME_UNITS:
        declared_base = _to_grams_or_ml(declared_value, declared_unit)
        measured_base = _to_grams_or_ml(measured_value, measured_unit)
        tolerance = _weight_volume_tolerance(declared_base)
        base_label = "g" if declared_unit in WEIGHT_UNITS else "ml"
    elif declared_unit == "cm" or declared_unit == "m":
        declared_base = _to_metres(declared_value, declared_unit)
        measured_base = _to_metres(measured_value, measured_unit)
        tolerance = _percent_tolerance(declared_base, LENGTH_BANDS_M)
        base_label = "m"
    elif declared_unit in COUNT_UNITS:
        declared_base = declared_value
        measured_base = measured_value
        tolerance = _percent_tolerance(declared_base, [(math.inf, NUMBER_PERCENT)])
        base_label = declared_unit
    else:
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.NEEDS_REVIEW,
            legal_reference=LEGAL_REF, detected_value=f"{measured_value} {measured_unit}",
            reason=f"Unit '{declared_unit}' is not covered by a known maximum-permissible-error table; verify manually.",
        )

    # Rule 2(e): MPE is specifically an error IN DEFICIENCY. A package that
    # weighs more than declared is not a Legal Metrology violation on this
    # ground, however unusual — only a shortfall beyond tolerance is.
    deficiency = declared_base - measured_base
    detected = f"declared {declared_value} {declared_unit}; measured {measured_value} {measured_unit} (tolerance {tolerance:.3g} {base_label})"

    if deficiency > tolerance:
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.FAIL,
            legal_reference=LEGAL_REF, detected_value=detected,
            reason=f"Measured quantity is {deficiency:.3g} {base_label} short of declared, exceeding the {tolerance:.3g} {base_label} maximum permissible error.",
            recommendation="Investigate underfilling; re-weigh additional samples from the same lot.",
        )

    return RuleResult(
        rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.PASS,
        legal_reference=LEGAL_REF, detected_value=detected,
        reason="Measured quantity is within the maximum permissible error.",
    )

"""Conservative, explainable extraction from English OCR output.

Two passes run, in order:

1. A linear regex pass over the flattened ``raw_text`` (``_extract_linear``).
   Cheap, and correct whenever OCR's reading order happens to put a value
   right after its label — the common case on simple, single-column labels.

2. A spatial pass (``extract_declarations_spatial``) over each photographed
   image's own OCR regions, for any field the linear pass missed. Real
   multi-column back-of-pack labels routinely break assumption (1): PaddleOCR
   reads a whole ingredients paragraph between a "USE BY" label and its own
   date, or reads a column out of order entirely. The spatial pass instead
   uses the bounding-box polygon PaddleOCR already returns for every
   detected text box, and pairs a label region with whichever *other*
   region in the same photographed image is nearest to it in pixel space.

A pass cannot recover a field whose label text PaddleOCR never detected at
all (no label region exists to anchor a pairing to) — that is an OCR
recognition gap, not something label/value pairing can fix.
"""

import math
import re

Region = dict


def _first(pattern: str, text: str, flags: int = re.IGNORECASE) -> re.Match[str] | None:
    return re.search(pattern, text, flags)


def _extract_linear(raw_text: str) -> dict:
    facts: dict = {"raw_text": raw_text}

    mrp = _first(r"\b(?:m\.?r\.?p\.?|maximum\s+retail\s+price)\b[^\n]{0,48}?(?:₹\s*|rs\.?\s*|inr\s*)+(?:₹\s*)?([0-9][0-9,]*(?:\.\d{1,2})?)", raw_text)
    if mrp:
        facts["mrp"] = {"value": mrp.group(1).replace(",", ""), "currency": "INR", "raw": mrp.group(0)}

    quantity = _first(
        r"\b(?:net\.?\s*(?:wt\.?|weight|qty|quantity)?|quantity)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l|litre|litres|cm|m|pieces?|pairs?|sets?)\b",
        raw_text,
    )
    if quantity:
        unit = quantity.group(2).lower()
        facts["net_quantity"] = {"value": quantity.group(1), "unit": {"litre": "l", "litres": "l"}.get(unit, unit)}
    else:
        # Rotation OCR can return the value immediately before its vertical
        # "Net Wt." label. Accept it only when both appear in the same short
        # declaration block.
        nearby_quantity = _first(
            r"(?:net\.?\s*(?:wt\.?|weight)[\s\S]{0,160}?(\d+(?:\.\d+)?)\s*(kg|g|ml|l|litre|litres)|"
            r"(\d+(?:\.\d+)?)\s*(kg|g|ml|l|litre|litres)[\s\S]{0,160}?net\.?\s*(?:wt\.?|weight))",
            raw_text,
        )
        if nearby_quantity:
            value, unit = (nearby_quantity.group(1), nearby_quantity.group(2)) if nearby_quantity.group(1) else (nearby_quantity.group(3), nearby_quantity.group(4))
            facts["net_quantity"] = {"value": value, "unit": {"litre": "l", "litres": "l"}.get(unit.lower(), unit.lower())}

    month_year = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[ .-]+\d{2,4}"
    date_value = rf"(?:0?[1-9]|[12]\d|3[01])[-/ .](?:0?[1-9]|1[0-2])[-/ .](?:\d{{2}}|\d{{4}})|{month_year}"
    manufacture = _first(rf"\b(?:mfd|mfg|date\s+of\s+(?:manufacture|packing|packaging)|packed\s*(?:on)?|pkd)\b\s*[:\-]?\s*({date_value})", raw_text)
    if manufacture:
        facts["manufacture_date"] = manufacture.group(1).strip()

    best_before = _first(rf"\b(?:best\s+before|use\s+by|expiry|exp)\b\s*[:\-]?\s*({date_value})", raw_text)
    if best_before:
        facts["best_before"] = best_before.group(1).strip()

    lot = _first(r"\b(?:lot|batch)\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9/-]{3,})\b", raw_text)
    if lot:
        facts["lot_number"] = lot.group(1)

    phone = _first(r"(?<!\d)(?:\+91[-\s]?)?[6-9]\d{9}(?!\d)|\b1800[-\s]?\d{3}[-\s]?\d{3,4}\b", raw_text)
    email = _first(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", raw_text)
    if phone or email:
        facts["consumer_care"] = {"phone": phone.group(0) if phone else None, "email": email.group(0) if email else None}

    origin = _first(r"\b(?:made|manufactured|product)\s+in\s+(india|[a-z][a-z ]{2,40})\b", raw_text)
    if origin:
        country = origin.group(1).strip().title()
        facts["country_of_origin"] = country
        facts["product_origin"] = "domestic" if country.lower() == "india" else "imported"

    unit_price = _first(r"(?:₹|rs\.?|inr)\s*[0-9][0-9,]*(?:\.\d{1,2})?\s*(?:/|per)\s*(?:kg|g|ml|l|litre|m|cm)\b", raw_text)
    if unit_price:
        facts["unit_sale_price"] = unit_price.group(0)

    manufacturer = _first(r"\b(?:manufactured|packed|imported)\s+by\b\s*[:\-]?\s*([^\n]{3,120})", raw_text)
    if manufacturer:
        facts["manufacturer"] = {"name": manufacturer.group(1).strip(), "address": None}

    return facts


_LABEL_PATTERNS = {
    "mrp": re.compile(r"\b(?:m\.?r\.?p\.?|maximum\s+retail\s+price)\b", re.IGNORECASE),
    "net_quantity": re.compile(r"\bnet\.?\s*(?:wt\.?|weight|qty|quantity)?\b", re.IGNORECASE),
    "manufacture_date": re.compile(r"\b(?:mfd|mfg|date\s+of\s+(?:manufacture|packing|packaging)|packed\s*(?:on)?|pkd)\b", re.IGNORECASE),
    "best_before": re.compile(r"\b(?:best\s+before|use\s+by|expiry|exp)\b", re.IGNORECASE),
    "lot_number": re.compile(r"\b(?:lot|batch)\s*(?:no\.?|number|#)?\b", re.IGNORECASE),
    "manufacturer": re.compile(r"\b(?:manufactured|packed|imported)\s+by\b", re.IGNORECASE),
}

_MONTH_YEAR = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[ .-]+\d{2,4}"
_DATE_VALUE = rf"(?:0?[1-9]|[12]\d|3[01])[-/ .](?:0?[1-9]|1[0-2])[-/ .](?:\d{{2}}|\d{{4}})|{_MONTH_YEAR}"

_VALUE_PATTERNS = {
    "mrp": re.compile(r"(?:₹\s*|rs\.?\s*|inr\s*)*([0-9][0-9,]*(?:\.\d{1,2})?)", re.IGNORECASE),
    "net_quantity": re.compile(r"(\d+(?:\.\d+)?)\s*(kg|g|ml|l|litre|litres|cm|m|pieces?|pairs?|sets?)\b", re.IGNORECASE),
    "manufacture_date": re.compile(_DATE_VALUE, re.IGNORECASE),
    "best_before": re.compile(_DATE_VALUE, re.IGNORECASE),
    # A real lot/batch code always contains at least one digit (e.g.
    # "B0726H0", "100120120"). Without that lookahead this also matched
    # plain English words sitting near a "LOT No." label in a dense
    # declaration block — e.g. "MACHINE" (from an unrelated "MACHINE CODE"
    # line) was picked up as a lot number on real label text.
    "lot_number": re.compile(r"\b((?=[A-Z0-9/-]*\d)[A-Z0-9][A-Z0-9/-]{3,})\b", re.IGNORECASE),
    "manufacturer": re.compile(r".{3,}"),
}


def _polygon_center(polygon: list[list[float]]) -> tuple[float, float]:
    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def _distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _y_range(polygon: list[list[float]]) -> tuple[float, float]:
    ys = [point[1] for point in polygon]
    return min(ys), max(ys)


def _vertical_overlap_ratio(a: tuple[float, float], b: tuple[float, float]) -> float:
    overlap = max(0.0, min(a[1], b[1]) - max(a[0], b[0]))
    span = min(a[1] - a[0], b[1] - b[0])
    return overlap / span if span else 0.0


def _nearest_matching_region(
    label_region: Region, candidates: list[Region], value_pattern: re.Pattern, claimed: set[int]
) -> tuple[Region | None, re.Match | None]:
    """Prefer a candidate printed on the same line as the label (large
    vertical bounding-box overlap), ranked by horizontal distance — this is
    how a label and its value actually sit on real packaging. Pure 2D
    nearest-neighbor is used only as a fallback when nothing shares the
    label's line, since it can otherwise be fooled by an unrelated line
    (e.g. an address block) that happens to sit closer diagonally than the
    label's own value does horizontally.
    """
    label_center = _polygon_center(label_region["polygon"])
    label_y_range = _y_range(label_region["polygon"])

    same_row_region: Region | None = None
    same_row_match: re.Match | None = None
    same_row_distance = math.inf
    overall_region: Region | None = None
    overall_match: re.Match | None = None
    overall_distance = math.inf

    for region in candidates:
        if region is label_region or id(region) in claimed:
            continue
        match = value_pattern.search(region["text"])
        if not match:
            continue
        region_center = _polygon_center(region["polygon"])
        distance = _distance(label_center, region_center)
        if distance < overall_distance:
            overall_region, overall_match, overall_distance = region, match, distance

        if _vertical_overlap_ratio(label_y_range, _y_range(region["polygon"])) >= 0.3:
            horizontal_distance = abs(region_center[0] - label_center[0])
            if horizontal_distance < same_row_distance:
                same_row_region, same_row_match, same_row_distance = region, match, horizontal_distance

    if same_row_region is not None:
        return same_row_region, same_row_match
    return overall_region, overall_match


def _spatial_fact(field: str, match: re.Match, region: Region):
    if field == "mrp":
        return {"value": match.group(1).replace(",", ""), "currency": "INR", "raw": region["text"]}
    if field == "net_quantity":
        unit = match.group(2).lower()
        return {"value": match.group(1), "unit": {"litre": "l", "litres": "l"}.get(unit, unit)}
    if field in ("manufacture_date", "best_before"):
        return match.group(0).strip()
    if field == "lot_number":
        return match.group(1)
    if field == "manufacturer":
        return {"name": region["text"].strip(), "address": None}
    return None


def extract_declarations_spatial(region_groups: list[list[Region]]) -> dict:
    """Pair each declaration label with the nearest value-shaped OCR region,
    using the polygon PaddleOCR already returns for every detected text box.

    ``region_groups`` is a list of region lists, one per photographed image
    (a panel's primary shot and its rotated declaration-strip crop are
    different coordinate spaces — see ocr.py's ``source`` tagging). Pairing
    only ever compares regions within the same group; comparing across
    groups would measure distance between two unrelated pixel spaces and
    produce meaningless pairs.
    """
    # field -> (normalized_distance, value_region, match). A label can
    # appear on more than one panel (e.g. "LOT No." on both the back and
    # bottom panels of a real pack) — keep whichever pairing is closest
    # *relative to its own image's size*, not just whichever group happened
    # to be processed first. Raw pixel distance isn't comparable across
    # groups since each image has its own resolution/scale.
    best: dict[str, tuple[float, Region, re.Match]] = {}

    for regions in region_groups:
        regions = [region for region in regions if region.get("text", "").strip() and region.get("polygon")]
        if not regions:
            continue

        xs = [x for region in regions for x, _ in region["polygon"]]
        ys = [y for region in regions for _, y in region["polygon"]]
        diagonal = math.hypot(max(xs) - min(xs), max(ys) - min(ys))
        # A generous cap, not a tight one: real labels are sometimes a
        # column-width away from their value. This only guards against
        # pairing with something from a totally unrelated part of the image.
        max_distance = diagonal * 0.6 if diagonal else math.inf

        # A single detected region (e.g. one date) must not become the
        # value for two different labels (e.g. both "PKD." and "USE BY"
        # claiming the same date) just because it happens to be the
        # nearest date-shaped text to both. Once a region is used for a
        # field within this image, it is off the table for every other
        # field in the same image.
        claimed: set[int] = set()

        for field, label_pattern in _LABEL_PATTERNS.items():
            for label_region in regions:
                if not label_pattern.search(label_region["text"]):
                    continue
                candidates = (
                    [r for r in regions if len(r["text"].strip()) >= 3] if field == "manufacturer" else regions
                )
                nearest, match = _nearest_matching_region(label_region, candidates, _VALUE_PATTERNS[field], claimed)
                if nearest is None:
                    continue
                distance = _distance(_polygon_center(label_region["polygon"]), _polygon_center(nearest["polygon"]))
                if distance > max_distance:
                    continue
                claimed.add(id(nearest))
                normalized = distance / diagonal if diagonal else distance
                if field not in best or normalized < best[field][0]:
                    best[field] = (normalized, nearest, match)
                break

    return {field: _spatial_fact(field, match, region) for field, (_, region, match) in best.items()}


def extract_declarations(raw_text: str, region_groups: list[list[Region]] | None = None) -> dict:
    facts = _extract_linear(raw_text)
    if region_groups:
        for field, value in extract_declarations_spatial(region_groups).items():
            facts.setdefault(field, value)
    return facts

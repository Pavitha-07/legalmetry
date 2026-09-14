"""Automatic scale calibration from a ₹10 coin in a calibration photo.

The detector is deliberately conservative. An image with an ambiguous circular
object produces a retake/review result instead of an unreliable mm-per-pixel
value. A detected coin is a calibration aid, not a legal measurement device.

Tilt correction
---------------
A coin held flat photographs as a circle.  When it is tilted toward or away
from the camera it photographs as an ellipse — the axis perpendicular to the
tilt axis is foreshortened.  The ratio of the ellipse's minor axis to its
major axis (tilt_ratio) quantifies the foreshortening.

We recover the ellipse by:
  1. Extracting the Canny edge pixels inside a ring around the HoughCircles
     centre (slightly wider than the circle radius so we capture the full rim).
  2. Running cv2.fitEllipse on those contour points.
  3. Using the major axis as the true diameter of the coin (the dimension that
     is NOT foreshortened), giving a more accurate pixels_per_mm value.
  4. Storing tilt_ratio = minor / major.  A perfectly flat coin gives 1.0;
     values below ~0.85 indicate enough tilt that the inspector should
     re-take the shot with the coin lying flat.

If the ellipse fit fails (too few edge points, degenerate contour, etc.) the
code falls back to the HoughCircles radius as it did before, and tilt_ratio
is set to 1.0 with a note in the reason string.
"""

from dataclasses import asdict, dataclass

import cv2
import numpy as np

from app.services.coin_yolo import detect_coin_yolo

COIN_DIAMETER_MM = 27.0
MIN_CONFIDENCE = 0.78
# Tilt ratio below this threshold triggers a NEEDS_REVIEW result: the coin is
# tilted enough that the major-axis scale estimate is unreliable.
MIN_TILT_RATIO = 0.82
# Minimum number of edge points needed to fit a meaningful ellipse.
MIN_ELLIPSE_POINTS = 12


@dataclass
class CalibrationResult:
    status: str
    confidence: float
    reason: str
    center_x: int | None = None
    center_y: int | None = None
    major_axis_px: float | None = None
    minor_axis_px: float | None = None
    pixels_per_mm: float | None = None
    tilt_ratio: float | None = None
    image_width: int | None = None
    image_height: int | None = None

    def to_dict(self) -> dict:
        return asdict(self)


def _ring_edge_score(edges: np.ndarray, x: int, y: int, radius: int) -> float:
    angles = np.linspace(0, 2 * np.pi, 180, endpoint=False)
    samples = []
    for delta in (-2, 0, 2):
        xs = np.rint(x + (radius + delta) * np.cos(angles)).astype(int)
        ys = np.rint(y + (radius + delta) * np.sin(angles)).astype(int)
        valid = (xs >= 0) & (xs < edges.shape[1]) & (ys >= 0) & (ys < edges.shape[0])
        if valid.any():
            samples.append(edges[ys[valid], xs[valid]].mean() / 255.0)
    return float(np.mean(samples)) if samples else 0.0


def _coin_appearance_score(gray: np.ndarray, saturation: np.ndarray, x: int, y: int, radius: int) -> float:
    """Score a candidate's metal-like interior without trusting any one feature."""
    mask = np.zeros(gray.shape, dtype=np.uint8)
    cv2.circle(mask, (x, y), max(1, int(radius * 0.62)), 255, -1)
    mean_saturation = float(cv2.mean(saturation, mask=mask)[0])
    texture = float(cv2.meanStdDev(gray, mask=mask)[1][0][0])
    saturation_score = max(0.0, 1.0 - abs(mean_saturation - 70.0) / 115.0)
    texture_score = max(0.0, 1.0 - abs(texture - 28.0) / 55.0)
    return 0.65 * saturation_score + 0.35 * texture_score


def _fit_ellipse_on_coin(
    edges: np.ndarray,
    cx: int,
    cy: int,
    hough_radius: int,
) -> tuple[float, float, float] | None:
    """Fit an ellipse to the Canny rim of the coin candidate.

    Collects edge pixels that fall inside an annular ring around (cx, cy),
    then calls cv2.fitEllipse on them.

    Returns (major_axis_px, minor_axis_px, tilt_ratio) if the fit succeeds,
    or None if there are too few rim points or the ellipse is degenerate.
    """
    # Sample ring: from 0.80 to 1.20 of the Hough radius so we catch the full
    # rim even when the coin is slightly tilted or the Hough estimate is off.
    r_inner = max(1, int(hough_radius * 0.80))
    r_outer = int(hough_radius * 1.20)

    h, w = edges.shape
    # Build a coordinate grid clipped to a bounding box around the coin.
    x0 = max(0, cx - r_outer - 4)
    y0 = max(0, cy - r_outer - 4)
    x1 = min(w, cx + r_outer + 4)
    y1 = min(h, cy + r_outer + 4)

    roi = edges[y0:y1, x0:x1]
    ys, xs = np.where(roi > 0)
    # Convert back to full-image coordinates.
    xs = xs + x0
    ys = ys + y0

    # Keep only points inside the annular ring.
    dist_sq = (xs - cx) ** 2 + (ys - cy) ** 2
    mask = (dist_sq >= r_inner ** 2) & (dist_sq <= r_outer ** 2)
    pts_x = xs[mask]
    pts_y = ys[mask]

    if len(pts_x) < MIN_ELLIPSE_POINTS:
        return None

    # cv2.fitEllipse expects an (N, 1, 2) int32 array.
    contour = np.column_stack([pts_x, pts_y]).reshape(-1, 1, 2).astype(np.int32)
    try:
        _center, (axis_a, axis_b), _angle = cv2.fitEllipse(contour)
    except cv2.error:
        return None

    # fitEllipse returns the two axes in arbitrary order — ensure major ≥ minor.
    major_axis = float(max(axis_a, axis_b))
    minor_axis = float(min(axis_a, axis_b))

    if major_axis <= 0 or minor_axis <= 0:
        return None

    tilt_ratio = float(minor_axis / major_axis)
    return float(major_axis), float(minor_axis), tilt_ratio


def detect_ten_rupee_coin(image_bytes: bytes) -> CalibrationResult:
    array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        return CalibrationResult("needs_review", 0.0, "Calibration image could not be decoded.")

    height, width = image.shape[:2]
    minimum = min(height, width)
    if minimum < 180:
        return CalibrationResult(
            "needs_review", 0.0,
            "Calibration image is too small to detect a coin reliably.",
            image_width=width, image_height=height,
        )

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (7, 7), 1.5)
    edges = cv2.Canny(blurred, 60, 150)

    # Primary path: the YOLOv8n detector trained on real ₹10-coin photos
    # (see coin-detector/ at the repo root) — more robust to background
    # clutter than the classical approach below. Falls back to it whenever
    # the model file is missing or finds nothing confident, never partially
    # combined with it — the two candidate-detection strategies are kept
    # fully separate so a bug in one can't silently corrupt the other.
    yolo_detection = detect_coin_yolo(image)
    if yolo_detection is not None:
        cx, cy, yolo_radius, yolo_confidence = yolo_detection
        margin = max(12, minimum // 40)
        in_bounds = (
            cx - yolo_radius >= margin and cy - yolo_radius >= margin
            and cx + yolo_radius < width - margin and cy + yolo_radius < height - margin
        )
        # Same acceptance bar as the classical path below (MIN_CONFIDENCE) —
        # a low-confidence YOLO box isn't trusted outright, it just falls
        # through to let the classical detector have a try too, exactly
        # like the classical path itself falling through to needs_review
        # only once nothing confident was found at all.
        if in_bounds and yolo_confidence >= MIN_CONFIDENCE:
            confidence = float(round(min(0.96, yolo_confidence), 3))
            return _finish_detection(cx, cy, yolo_radius, confidence, edges, width, height)

    # Fallback: classical HoughCircles + hand-tuned edge/appearance scoring.
    saturation = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)[:, :, 1]

    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.1,
        minDist=max(90, minimum // 10),
        param1=120,
        param2=55,
        minRadius=max(40, minimum // 22),
        maxRadius=max(90, minimum // 6),
    )
    if circles is None:
        return CalibrationResult(
            "needs_review", 0.0,
            "No sufficiently clear circular coin candidate was found; retake the calibration photo.",
            image_width=width, image_height=height,
        )

    candidates: list[tuple[float, int, int, int]] = []
    margin = max(12, minimum // 40)
    for x, y, radius in np.round(circles[0]).astype(int):
        if x - radius < margin or y - radius < margin or x + radius >= width - margin or y + radius >= height - margin:
            continue
        edge_score = _ring_edge_score(edges, x, y, radius)
        appearance_score = _coin_appearance_score(gray, saturation, x, y, radius)
        score = 0.72 * min(1.0, edge_score / 0.25) + 0.28 * appearance_score
        candidates.append((score, x, y, radius))

    if not candidates:
        return CalibrationResult(
            "needs_review", 0.0,
            "Coin candidate is cropped or too close to the image edge.",
            image_width=width, image_height=height,
        )

    candidates.sort(reverse=True)
    score, cx, cy, hough_radius = candidates[0]
    runner_up = candidates[1][0] if len(candidates) > 1 else 0.0
    separation = max(0.0, score - runner_up)
    confidence = float(round(min(0.96, max(0.0, float(score * 0.88 + min(0.14, separation)))), 3))

    if confidence < MIN_CONFIDENCE or separation < 0.06:
        return CalibrationResult(
            "needs_review",
            confidence,
            "A circular candidate was found but is not distinct enough from the background; "
            "retake with the ₹10 coin fully visible on a plain area.",
            int(cx), int(cy),
            float(hough_radius * 2), float(hough_radius * 2),
            image_width=width, image_height=height,
        )

    return _finish_detection(int(cx), int(cy), int(hough_radius), confidence, edges, width, height)


def _finish_detection(
    cx: int, cy: int, seed_radius: int, confidence: float, edges: np.ndarray, width: int, height: int
) -> CalibrationResult:
    """Shared downstream step once SOME candidate detector (YOLO or the
    classical Hough pipeline) has proposed a coin center + rough radius.
    Ellipse-fit tilt correction and confidence gating are identical either
    way — only how the initial candidate was found differs.
    """
    ellipse = _fit_ellipse_on_coin(edges, cx, cy, seed_radius)

    if ellipse is not None:
        major_axis_px, minor_axis_px, tilt_ratio = ellipse

        if tilt_ratio < MIN_TILT_RATIO:
            # Coin is tilted enough that the measurement is unreliable.
            return CalibrationResult(
                "needs_review",
                confidence,
                f"Coin detected but is tilted (tilt ratio {tilt_ratio:.3f} < {MIN_TILT_RATIO}). "
                "Place the coin flat on the label and retake shot A.",
                int(cx), int(cy),
                round(major_axis_px, 2),
                round(minor_axis_px, 2),
                pixels_per_mm=None,
                tilt_ratio=round(tilt_ratio, 4),
                image_width=width, image_height=height,
            )

        # Use the major axis as the true diameter — it is the dimension that
        # lies perpendicular to the tilt axis and is therefore unforeshortened.
        pixels_per_mm = round(major_axis_px / COIN_DIAMETER_MM, 4)
        reason = (
            f"₹10 coin detected; ellipse fit tilt ratio {tilt_ratio:.3f} "
            f"(major {major_axis_px:.1f} px, minor {minor_axis_px:.1f} px). "
            "Scale derived from major axis."
        )
    else:
        # Ellipse fit failed — fall back to the seed radius from whichever
        # candidate detector ran.
        major_axis_px = float(seed_radius * 2)
        minor_axis_px = float(seed_radius * 2)
        tilt_ratio = 1.0
        pixels_per_mm = round(major_axis_px / COIN_DIAMETER_MM, 4)
        reason = (
            "₹10 coin detected; ellipse fit could not resolve tilt "
            "(too few rim points). Scale derived from the detector's own radius — ensure the coin is flat."
        )

    return CalibrationResult(
        "calibrated",
        confidence,
        reason,
        int(cx), int(cy),
        round(major_axis_px, 2),
        round(minor_axis_px, 2),
        pixels_per_mm,
        round(tilt_ratio, 4),
        width, height,
    )


def measure_text_heights(regions: list[dict], pixels_per_mm: float | None) -> list[dict]:
    """Convert OCR polygon heights to millimetres using a trusted coin scale."""
    if not pixels_per_mm:
        return []

    measurements: list[dict] = []
    for region in regions:
        polygon = region.get("polygon") or []
        text = str(region.get("text") or "").strip()
        confidence = float(region.get("confidence") or 0.0)
        if len(polygon) != 4 or not text or confidence < 0.80:
            continue
        points = np.asarray(polygon, dtype=float)
        left_height = float(np.linalg.norm(points[3] - points[0]))
        right_height = float(np.linalg.norm(points[2] - points[1]))
        height_px = (left_height + right_height) / 2.0
        if height_px < 3:
            continue
        measurements.append(
            {
                "text": text,
                "confidence": round(confidence, 4),
                "height_px": round(height_px, 2),
                "height_mm": round(height_px / pixels_per_mm, 3),
            }
        )
    return measurements

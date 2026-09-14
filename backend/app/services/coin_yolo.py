"""YOLOv8n coin detector, trained on 183 real ₹10-coin photos (see
coin-detector/ at the repo root for the training pipeline), exported to
ONNX and run via cv2.dnn — no extra ML-framework dependency beyond OpenCV,
which calibration.py already requires.

This replaces only the candidate-detection step (finding roughly where the
coin is) in calibration.py's pipeline. The downstream ellipse-fit tilt
correction and confidence gating are unchanged — YOLO's whole value-add
over the classical HoughCircles approach is robustness to background
clutter, not a replacement for the tilt math.

Validated against a held-out validation image before wiring in: predicted
center/size matched the hand-labeled ground truth within ~1px.
"""

from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

MODEL_PATH = Path(__file__).parent.parent / "ml_models" / "coin_detector.onnx"
INPUT_SIZE = 640
CONFIDENCE_THRESHOLD = 0.5


@lru_cache(maxsize=1)
def _net() -> cv2.dnn.Net | None:
    if not MODEL_PATH.exists():
        return None
    return cv2.dnn.readNetFromONNX(str(MODEL_PATH))


def detect_coin_yolo(image: np.ndarray) -> tuple[int, int, int, float] | None:
    """Returns (center_x, center_y, radius_px, confidence) in the image's
    own pixel space, or None if the model isn't available or found nothing
    above CONFIDENCE_THRESHOLD. radius_px is a coarse estimate (average of
    the box's half-width and half-height) — good enough to seed the
    downstream ellipse fit, not a final measurement.
    """
    net = _net()
    if net is None:
        return None

    height, width = image.shape[:2]
    blob = cv2.dnn.blobFromImage(
        image, scalefactor=1 / 255.0, size=(INPUT_SIZE, INPUT_SIZE), swapRB=True, crop=False
    )
    net.setInput(blob)
    output = net.forward()

    # YOLOv8 ONNX export shape is (1, 4 + num_classes, num_boxes); for our
    # single-class model that's (1, 5, 8400). Transpose to (num_boxes, 5)
    # so each row is [cx, cy, w, h, class0_score] in INPUT_SIZE pixel space.
    predictions = output[0].T
    scores = predictions[:, 4]
    best_idx = int(np.argmax(scores))
    best_score = float(scores[best_idx])
    if best_score < CONFIDENCE_THRESHOLD:
        return None

    cx, cy, w, h = predictions[best_idx, :4]
    scale_x = width / INPUT_SIZE
    scale_y = height / INPUT_SIZE
    center_x = cx * scale_x
    center_y = cy * scale_y
    radius = (w * scale_x + h * scale_y) / 4.0
    return int(round(center_x)), int(round(center_y)), int(round(radius)), best_score

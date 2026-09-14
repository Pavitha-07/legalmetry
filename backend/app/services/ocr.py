"""English OCR adapter. The worker initializes the model lazily on first use."""

from functools import lru_cache
from pathlib import Path
from tempfile import NamedTemporaryFile

import cv2
import numpy as np
from paddleocr import PaddleOCR


@lru_cache(maxsize=1)
def english_ocr() -> PaddleOCR:
    return PaddleOCR(
        lang="en",
        # Field photos are rarely flat, upright pages: a plastic wrapper
        # photographed in-hand is tilted, curved, and sometimes rotated.
        # These three correction stages target exactly that — whole-image
        # rotation, page/surface warp, and individual tilted text lines —
        # at the cost of extra model downloads on first use and somewhat
        # slower inference per image.
        use_doc_orientation_classify=True,
        use_doc_unwarping=True,
        use_textline_orientation=True,
        # The detector's own default (960px, "max" side) silently downscales
        # a typical 3000-4000px phone photo by 3-4x before it ever looks for
        # text boxes — enough to shrink small declaration print (MRP, net
        # weight, dates) below a detectable pixel height. Raising this
        # trades slower inference (this runs async in Celery, not in a
        # request path) for keeping that print legible to the detector.
        # Kept moderate (not e.g. 4000) because this machine's Docker VM has
        # ~5.8GB shared across every service — 1600 already pushed a 3-way
        # concurrent panel batch into an OOM kill (see worker concurrency=1
        # in docker-compose.yml, which is the other half of that fix).
        text_det_limit_side_len=1280,
        enable_mkldnn=False,
    )


def _enhance(image: np.ndarray) -> np.ndarray:
    """Contrast and noise pass tuned for real-world label photos: uneven
    indoor lighting, glare off plastic packaging, and low local contrast on
    small printed text — the conditions that most often depress OCR
    confidence below the automatic-decision threshold."""
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    l_channel = clahe.apply(l_channel)
    enhanced = cv2.cvtColor(cv2.merge((l_channel, a_channel, b_channel)), cv2.COLOR_LAB2BGR)
    return cv2.fastNlMeansDenoisingColored(enhanced, None, 5, 5, 7, 21)


def _predict(image_bytes: bytes, suffix: str) -> dict:
    # Decode, enhance, and re-encode before handing the image to PaddleOCR.
    # If decoding fails for any reason, fall back to the original bytes
    # untouched rather than dropping the recognition pass entirely.
    decoded = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    if decoded is not None:
        encoded_ok, encoded = cv2.imencode(".jpg", _enhance(decoded))
        if encoded_ok:
            image_bytes = encoded.tobytes()
            suffix = ".jpg"

    with NamedTemporaryFile(suffix=suffix, delete=False) as temporary:
        temporary.write(image_bytes)
        image_path = Path(temporary.name)
    try:
        result = next(iter(english_ocr().predict(str(image_path))))
        texts = result.get("rec_texts", [])
        scores = result.get("rec_scores", [])
        polygons = result.get("rec_polys", [])
        regions = [
            {
                "text": str(text),
                "confidence": round(float(score), 4),
                "polygon": [[round(float(point[0]), 2), round(float(point[1]), 2)] for point in polygon],
            }
            for text, score, polygon in zip(texts, scores, polygons)
        ]
        usable_scores = [region["confidence"] for region in regions if region["text"].strip()]
        return {
            "raw_text": "\n".join(region["text"] for region in regions),
            "confidence": round(sum(usable_scores) / len(usable_scores), 4) if usable_scores else 0.0,
            "regions": regions,
        }
    finally:
        image_path.unlink(missing_ok=True)


def recognize_english(image_bytes: bytes, suffix: str = ".jpg") -> dict:
    primary = _predict(image_bytes, suffix)
    # Tag every region with which image it was detected in. The declaration
    # strip below is cropped and rotated 90 degrees, so its polygon
    # coordinates live in a completely different pixel space than the
    # primary pass — spatial label/value pairing (extraction.py) must never
    # compare distances across these two groups.
    for region in primary["regions"]:
        region["source"] = "primary"
    image = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        return primary

    # Labels frequently print MRP, lot, dates, and quantity vertically along
    # the left declaration strip. One focused rotation avoids expensive
    # full-image multi-pass OCR while preserving the normal panel text.
    strip = image[:, : max(1, int(image.shape[1] * 0.42))]
    encoded_ok, encoded = cv2.imencode(".png", cv2.rotate(strip, cv2.ROTATE_90_CLOCKWISE))
    if not encoded_ok:
        return primary
    declaration = _predict(encoded.tobytes(), ".png")
    if not declaration["raw_text"].strip():
        return primary
    for region in declaration["regions"]:
        region["source"] = "declaration_strip"

    regions = primary["regions"] + declaration["regions"]
    scores = [region["confidence"] for region in regions if region["text"].strip()]
    return {
        "raw_text": f"{primary['raw_text']}\n{declaration['raw_text']}",
        "confidence": round(sum(scores) / len(scores), 4) if scores else 0.0,
        "regions": regions,
        "declaration_rotation_applied": True,
    }

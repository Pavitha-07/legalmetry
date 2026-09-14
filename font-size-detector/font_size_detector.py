import sys
import math
from pathlib import Path

import cv2
import numpy as np
from paddleocr import PaddleOCR

# ---- Coin calibration ----------------------------------------------------
KNOWN_COIN_DIAMETER_MM = 27.0  # ₹10 coin
# ---------------------------------------------------------------------------

ocr_engine = PaddleOCR(use_textline_orientation=True, lang='en', enable_mkldnn=False)

click_points = []


def mark_coin(img):
    """Opens a window — click the coin's CENTER, then click its EDGE,
    then press any key to confirm. Manual marking guarantees correct
    calibration regardless of how busy/cluttered the background is."""
    display = img.copy()
    window_name = "Click COIN CENTER, then click COIN EDGE (any key to confirm)"

    def on_click(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN and len(click_points) < 2:
            click_points.append((x, y))
            cv2.circle(display, (x, y), 5, (0, 255, 0), -1)
            if len(click_points) == 2:
                cx, cy = click_points[0]
                r = int(math.hypot(x - cx, y - cy))
                cv2.circle(display, (cx, cy), r, (0, 255, 0), 3)
            cv2.imshow(window_name, display)

    cv2.imshow(window_name, display)
    cv2.setMouseCallback(window_name, on_click)
    cv2.waitKey(0)
    cv2.destroyAllWindows()

    if len(click_points) < 2:
        return None

    (cx, cy), (ex, ey) = click_points
    r = int(math.hypot(ex - cx, ey - cy))
    return (cx, cy, r)


def calculate_mm_per_pixel(radius_px: float) -> float:
    diameter_px = radius_px * 2
    return KNOWN_COIN_DIAMETER_MM / diameter_px


def box_height_px(box):
    # box = 4 corner points: top-left, top-right, bottom-right, bottom-left
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = box
    left_edge = math.hypot(x3 - x0, y3 - y0)
    right_edge = math.hypot(x2 - x1, y2 - y1)
    return (left_edge + right_edge) / 2


def annotate(img, coin, text_results, output_path):
    output = img.copy()

    if coin:
        x, y, r = coin
        cv2.circle(output, (x, y), r, (0, 255, 0), 3)
        cv2.putText(output, "COIN", (x - 20, y - r - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

    for box, text, height_mm in text_results:
        pts = np.array(box, dtype=np.int32)
        cv2.polylines(output, [pts], True, (0, 0, 255), 2)
        cv2.putText(output, f"{height_mm:.2f}mm", (int(box[0][0]), int(box[0][1]) - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)

    cv2.imwrite(output_path, output)


def main():
    if len(sys.argv) < 2:
        print("Usage: python font_size_detector.py <image_path>")
        sys.exit(1)

    image_path = sys.argv[1]
    img = cv2.imread(image_path)
    if img is None:
        raise FileNotFoundError(f"Could not read image: {image_path}")

    print("A window will open. Click the CENTER of the coin, then click its EDGE, then press any key.")
    coin = mark_coin(img)

    if coin is None:
        print("Coin not marked — cannot calibrate. Aborting.")
        return

    x, y, r = coin
    mm_per_px = calculate_mm_per_pixel(r)
    print(f"Coin marked: center=({x},{y}) radius={r}px -> mm_per_pixel={mm_per_px:.4f}")

    print("Running OCR (first run downloads models, may take a minute)...")
    result = ocr_engine.predict(image_path)

    text_results = []
    for res in result:
        texts = res['rec_texts']
        polys = res['rec_polys']
        for text, poly in zip(texts, polys):
            height_px = box_height_px(poly)
            height_mm = height_px * mm_per_px
            text_results.append((poly, text, height_mm))

    print(f"\nDetected {len(text_results)} text region(s):\n")
    for box, text, height_mm in text_results:
        print(f"  '{text}'  ->  height = {height_mm:.2f} mm")

    output_path = str(Path(image_path).with_stem(Path(image_path).stem + "_annotated"))
    annotate(img, coin, text_results, output_path)
    print(f"\nAnnotated image saved to: {output_path}")


if __name__ == "__main__":
    main()
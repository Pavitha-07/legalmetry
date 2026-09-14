import sys
import cv2
import numpy as np

BLUR_KERNEL = (9, 9)
HOUGH_DP = 1.2
HOUGH_MIN_DIST = 100
HOUGH_PARAM1 = 100
HOUGH_PARAM2 = 70  # raised significantly from 40 — demand much stronger edge evidence
HOUGH_MIN_RADIUS = 20
HOUGH_MAX_RADIUS = 300


def detect_coin(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, BLUR_KERNEL, 0)
    circles = cv2.HoughCircles(
        blurred, cv2.HOUGH_GRADIENT, dp=HOUGH_DP, minDist=HOUGH_MIN_DIST,
        param1=HOUGH_PARAM1, param2=HOUGH_PARAM2,
        minRadius=HOUGH_MIN_RADIUS, maxRadius=HOUGH_MAX_RADIUS,
    )
    if circles is None:
        return None, None
    all_circles = np.round(circles[0, :]).astype("int")
    chosen = max(all_circles, key=lambda c: c[2])
    return tuple(chosen), all_circles


def main():
    image_path = sys.argv[1]
    img = cv2.imread(image_path)

    coin, all_circles = detect_coin(img)
    output = img.copy()

    if all_circles is not None:
        for (cx, cy, cr) in all_circles:
            cv2.circle(output, (cx, cy), cr, (255, 0, 0), 2)
        print(f"Total candidates found: {len(all_circles)}")
    else:
        print("No circles detected at all.")

    if coin:
        x, y, r = coin
        cv2.circle(output, (x, y), r, (0, 255, 0), 3)
        print(f"Selected: center=({x},{y}) radius={r}px")

    cv2.imwrite("debug_coin_output.jpg", output)
    print("Saved debug_coin_output.jpg")


if __name__ == "__main__":
    main()
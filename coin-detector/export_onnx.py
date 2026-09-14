"""Export the trained weights to ONNX so backend/app/services/calibration.py
can run inference via cv2.dnn — no ultralytics/torch runtime dependency in
the production worker image, just OpenCV, which is already there.

Run after train.py: python export_onnx.py
Produces runs/detect/coin/weights/best.onnx.
"""

import _py311rc1_shim  # noqa: F401 — must run before ultralytics/torch import

from ultralytics import YOLO


def main() -> None:
    model = YOLO("runs/detect/coin/weights/best.pt")
    model.export(format="onnx", imgsz=640, opset=12, simplify=True)


if __name__ == "__main__":
    main()

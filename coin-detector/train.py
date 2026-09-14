"""Fine-tune YOLOv8n (nano) on the ₹10 coin dataset.

Nano, not a larger variant: this only ever needs to find one coin in one
photo, and it has to run fast on CPU in a memory-constrained worker
container (see backend/app/services/calibration.py's docstring on the
Docker VM's shared ~5.8GB budget) — a bigger backbone buys accuracy this
task doesn't need at a cost this box can't spare.

Run: python train.py
Weights land in runs/detect/coin/weights/best.pt — that .pt file is what
gets exported to ONNX for inference (see export_onnx.py).
"""

import _py311rc1_shim  # noqa: F401 — must run before ultralytics/torch import

from ultralytics import YOLO


def main() -> None:
    model = YOLO("yolov8n.pt")
    model.train(
        data="data.yaml",
        epochs=100,
        imgsz=640,
        batch=16,
        patience=20,  # stop early if val loss plateaus — 183 images overfits fast
        name="coin",
    )


if __name__ == "__main__":
    main()

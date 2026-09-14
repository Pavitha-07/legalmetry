import cv2
import numpy as np

MODEL_PATH = "runs/detect/coin/weights/best.onnx"
IMAGE_PATH = "dataset/images/val/003JPG.jpg"
INPUT_SIZE = 640

net = cv2.dnn.readNetFromONNX(MODEL_PATH)
image = cv2.imread(IMAGE_PATH)
height, width = image.shape[:2]
print(f"image size: {width}x{height}")

blob = cv2.dnn.blobFromImage(image, scalefactor=1 / 255.0, size=(INPUT_SIZE, INPUT_SIZE), swapRB=True, crop=False)
net.setInput(blob)
output = net.forward()
print("raw output shape:", output.shape)

predictions = output[0].T
print("transposed shape:", predictions.shape)
scores = predictions[:, 4]
best_idx = int(np.argmax(scores))
best_score = float(scores[best_idx])
print("best score:", best_score, "at index", best_idx)
cx, cy, w, h = predictions[best_idx, :4]
print(f"raw box (in {INPUT_SIZE}x{INPUT_SIZE} space): cx={cx:.2f} cy={cy:.2f} w={w:.2f} h={h:.2f}")

scale_x = width / INPUT_SIZE
scale_y = height / INPUT_SIZE
cx_img, cy_img, w_img, h_img = cx * scale_x, cy * scale_y, w * scale_x, h * scale_y
print(f"scaled to original image: cx={cx_img:.1f} cy={cy_img:.1f} w={w_img:.1f} h={h_img:.1f}")
print(f"expected from label: cx=141.0 cy=149.5 w=42.0 h=31.0")

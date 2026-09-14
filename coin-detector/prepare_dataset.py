"""One-time dataset prep: takes the raw exported images+labels (all class id
15, from a classes.txt shared across unrelated other projects) and produces
the train/val layout ultralytics YOLO expects, with the coin remapped to
class 0 (the only class this model will ever need).

Run once from this directory: python prepare_dataset.py
"""

import random
import shutil
from pathlib import Path

RAW_DIR = Path(__file__).parent / "dataset" / "images" / "10 Rupee Coin"
OUT_ROOT = Path(__file__).parent / "dataset"
VAL_FRACTION = 0.15
SEED = 42
SOURCE_CLASS_ID = "15"  # what this coin was labeled as in the raw export
TARGET_CLASS_ID = "0"   # the only class in our own single-class dataset


def remap_label(src_txt: Path, dst_txt: Path) -> None:
    lines = src_txt.read_text().strip().splitlines()
    rewritten = []
    for line in lines:
        parts = line.split()
        if not parts:
            continue
        # Defensive: only remap the class id we've confirmed every file uses.
        # If a stray file ever has a different class id, fail loudly rather
        # than silently mislabeling it.
        assert parts[0] == SOURCE_CLASS_ID, f"Unexpected class id {parts[0]!r} in {src_txt}"
        rewritten.append(" ".join([TARGET_CLASS_ID, *parts[1:]]))
    dst_txt.write_text("\n".join(rewritten) + "\n")


def main() -> None:
    images = sorted(RAW_DIR.glob("*.jpg"))
    if not images:
        raise SystemExit(f"No .jpg files found in {RAW_DIR}")

    pairs = []
    for image_path in images:
        label_path = image_path.with_suffix(".txt")
        if not label_path.exists():
            print(f"skip (no label): {image_path.name}")
            continue
        pairs.append((image_path, label_path))

    random.Random(SEED).shuffle(pairs)
    val_count = max(1, round(len(pairs) * VAL_FRACTION))
    val_pairs = pairs[:val_count]
    train_pairs = pairs[val_count:]

    for split, split_pairs in (("train", train_pairs), ("val", val_pairs)):
        images_out = OUT_ROOT / "images" / split
        labels_out = OUT_ROOT / "labels" / split
        images_out.mkdir(parents=True, exist_ok=True)
        labels_out.mkdir(parents=True, exist_ok=True)
        for image_path, label_path in split_pairs:
            shutil.copy2(image_path, images_out / image_path.name)
            remap_label(label_path, labels_out / label_path.with_suffix(".txt").name)

    print(f"train: {len(train_pairs)} images -> {OUT_ROOT / 'images' / 'train'}")
    print(f"val:   {len(val_pairs)} images -> {OUT_ROOT / 'images' / 'val'}")
    print("Class 15 remapped to class 0 ('coin') in every label file.")


if __name__ == "__main__":
    main()

"""Prepare a generated environment background for the fixed Phaser canvas."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    return parser.parse_args()


def center_crop_to_ratio(image: Image.Image, width: int, height: int) -> Image.Image:
    target_ratio = width / height
    source_ratio = image.width / image.height
    if source_ratio > target_ratio:
        crop_width = round(image.height * target_ratio)
        left = (image.width - crop_width) // 2
        return image.crop((left, 0, left + crop_width, image.height))
    crop_height = round(image.width / target_ratio)
    top = (image.height - crop_height) // 2
    return image.crop((0, top, image.width, top + crop_height))


def main() -> None:
    args = parse_args()
    source = Image.open(args.input).convert("RGB")
    cropped = center_crop_to_ratio(source, args.width, args.height)
    prepared = cropped.resize((args.width, args.height), Image.Resampling.LANCZOS)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.suffix.lower() == ".webp":
        prepared.save(args.output, format="WEBP", quality=90, method=6)
    else:
        prepared.save(args.output, format="PNG", optimize=True)
    print(f"Wrote {args.output} at {prepared.size}")


if __name__ == "__main__":
    main()

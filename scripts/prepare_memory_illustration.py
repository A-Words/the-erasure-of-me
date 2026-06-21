"""Prepare a generated memory illustration for efficient browser delivery."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--max-width", type=int, default=1152)
    parser.add_argument("--max-height", type=int, default=768)
    parser.add_argument("--quality", type=int, default=88)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    image = Image.open(args.input).convert("RGB")
    image.thumbnail((args.max_width, args.max_height), Image.Resampling.LANCZOS)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output, format="WEBP", quality=args.quality, method=6)
    print(f"Wrote {args.output} at {image.size}")


if __name__ == "__main__":
    main()

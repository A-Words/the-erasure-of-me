"""Normalize one transparent character seed into a bottom-centered game frame."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--width", type=int, default=64)
    parser.add_argument("--height", type=int, default=96)
    parser.add_argument("--padding", type=int, default=4)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source = Image.open(args.input).convert("RGBA")
    alpha = source.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError("source contains no visible pixels")

    cropped = source.crop(bounds)
    max_width = args.width - args.padding * 2
    max_height = args.height - args.padding * 2
    scale = min(max_width / cropped.width, max_height / cropped.height)
    target_size = (
        max(1, round(cropped.width * scale)),
        max(1, round(cropped.height * scale)),
    )
    resized = cropped.resize(target_size, Image.Resampling.LANCZOS)
    frame = Image.new("RGBA", (args.width, args.height), (0, 0, 0, 0))
    x = (args.width - resized.width) // 2
    y = args.height - args.padding - resized.height
    frame.alpha_composite(resized, (x, y))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    frame.save(args.output, optimize=True)

    visible = frame.getchannel("A").getbbox()
    print(f"Wrote {args.output} at {frame.size}; visible bounds={visible}")


if __name__ == "__main__":
    main()

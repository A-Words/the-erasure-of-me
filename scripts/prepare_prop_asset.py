#!/usr/bin/env python3
"""Crop and normalize a transparent prop onto a square game-ready canvas."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--size", type=int, default=128)
    parser.add_argument("--padding", type=int, default=4)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source = Image.open(args.input).convert("RGBA")
    alpha_bounds = source.getchannel("A").getbbox()
    if alpha_bounds is None:
        raise ValueError(f"No visible pixels in {args.input}")

    cropped = source.crop(alpha_bounds)
    available = args.size - args.padding * 2
    if available <= 0:
        raise ValueError("Padding leaves no room for the prop")
    cropped.thumbnail((available, available), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (args.size, args.size), (0, 0, 0, 0))
    position = ((args.size - cropped.width) // 2, (args.size - cropped.height) // 2)
    canvas.alpha_composite(cropped, position)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(args.output, optimize=True)
    print(f"Wrote {args.output} ({args.size}x{args.size})")


if __name__ == "__main__":
    main()

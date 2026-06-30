#!/usr/bin/env python3
"""Derive the collision-aligned epilogue home shell from the approved home art."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args()


def soft_ellipse_mask(
    size: tuple[int, int],
    bounds: tuple[int, int, int, int],
    opacity: int,
    blur: int,
) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).ellipse(bounds, fill=opacity)
    return mask.filter(ImageFilter.GaussianBlur(blur))


def main() -> None:
    args = parse_args()
    source = Image.open(args.input).convert("RGB")
    if source.size != (1280, 720):
        raise ValueError(f"Expected a 1280x720 home shell, got {source.size}")

    # Keep every architectural pixel registered while gently restoring light.
    prepared = ImageEnhance.Color(source).enhance(0.92)
    prepared = ImageEnhance.Brightness(prepared).enhance(1.055)
    prepared = ImageEnhance.Contrast(prepared).enhance(0.96)
    prepared = Image.blend(prepared, Image.new("RGB", source.size, "#f7ead5"), 0.055)

    window_light = soft_ellipse_mask(source.size, (650, -130, 1390, 610), 82, 105)
    living_light = soft_ellipse_mask(source.size, (260, 120, 1090, 780), 42, 135)
    warm_white = Image.new("RGB", source.size, "#f7f3e8")
    prepared = Image.composite(ImageChops.screen(prepared, warm_white), prepared, window_light)
    prepared = Image.composite(ImageChops.screen(prepared, warm_white), prepared, living_light)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    prepared.save(args.output, format="PNG", optimize=True)
    print(f"Wrote {args.output} at {prepared.size}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Repack a 2x2 hold-hand source grid into four 512x256 game frames."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--sheet-out", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source = Image.open(args.input).convert("RGB")
    if source.width % 2 or source.height % 2:
        raise ValueError("The source grid dimensions must both be divisible by two")

    cell_width = source.width // 2
    cell_height = source.height // 2
    crop_height = min(cell_height, cell_width // 2)
    vertical_margin = cell_height - crop_height
    crop_top = round(vertical_margin * 0.56)
    crop_top = max(0, min(crop_top, cell_height - crop_height))

    args.out_dir.mkdir(parents=True, exist_ok=True)
    frames: list[Image.Image] = []
    for index in range(4):
        column = index % 2
        row = index // 2
        left = column * cell_width
        top = row * cell_height + crop_top
        frame = source.crop((left, top, left + cell_width, top + crop_height))
        frame = frame.resize((512, 256), Image.Resampling.LANCZOS)
        frame.save(args.out_dir / f"{index + 1:02d}.png", optimize=True)
        frames.append(frame)

    sheet = Image.new("RGB", (512 * len(frames), 256))
    for index, frame in enumerate(frames):
        sheet.paste(frame, (index * 512, 0))
    args.sheet_out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.sheet_out, optimize=True)
    print(
        f"Wrote {args.sheet_out} at {sheet.size}; "
        f"source={source.size}, cell={(cell_width, cell_height)}, crop_top={crop_top}"
    )


if __name__ == "__main__":
    main()

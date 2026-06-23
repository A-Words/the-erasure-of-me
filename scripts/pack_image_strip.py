#!/usr/bin/env python3
"""Pack same-sized RGBA images into one horizontal spritesheet."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("inputs", nargs="+", type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    frames = [Image.open(path).convert("RGBA") for path in args.inputs]
    frame_size = frames[0].size
    if any(frame.size != frame_size for frame in frames):
        raise ValueError("All spritesheet frames must share one size")

    width, height = frame_size
    strip = Image.new("RGBA", (width * len(frames), height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * width, 0))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    strip.save(args.output, optimize=True)
    print(f"Wrote {args.output} ({len(frames)}x{width}x{height})")


if __name__ == "__main__":
    main()

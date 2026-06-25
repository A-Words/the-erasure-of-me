"""Extract foreground wall pixels from the prepared home background."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--crosswall-output", required=True, type=Path)
    parser.add_argument("--frontwall-output", required=True, type=Path)
    return parser.parse_args()


def masked_copy(source: Image.Image, polygons: list[list[tuple[int, int]]]) -> Image.Image:
    mask = Image.new("L", source.size, 0)
    draw = ImageDraw.Draw(mask)
    for polygon in polygons:
        draw.polygon(polygon, fill=255)
    output = Image.new("RGBA", source.size, (0, 0, 0, 0))
    output.paste(source, (0, 0), mask)
    return output


def main() -> None:
    args = parse_args()
    source = Image.open(args.input).convert("RGBA")
    if source.size != (1280, 720):
        raise ValueError(f"Expected a 1280x720 home background, got {source.size}")

    crosswall = masked_copy(
        source,
        [
            [(44, 349), (508, 349), (508, 431), (44, 431)],
            [(697, 349), (1235, 349), (1235, 431), (697, 431)],
        ],
    )
    frontwall = masked_copy(
        source,
        [
            [(17, 674), (1262, 674), (1262, 720), (17, 720)],
            [(344, 350), (370, 350), (370, 468), (344, 468)],
            [(344, 597), (370, 597), (370, 674), (344, 674)],
        ],
    )

    args.crosswall_output.parent.mkdir(parents=True, exist_ok=True)
    args.frontwall_output.parent.mkdir(parents=True, exist_ok=True)
    crosswall.save(args.crosswall_output, format="PNG", optimize=True)
    frontwall.save(args.frontwall_output, format="PNG", optimize=True)
    print(f"Wrote {args.crosswall_output} and {args.frontwall_output}")


if __name__ == "__main__":
    main()

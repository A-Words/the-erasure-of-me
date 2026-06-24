"""Extract foreground wall pixels from the prepared home background."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--partition-output", required=True, type=Path)
    parser.add_argument("--crosswall-output", required=True, type=Path)
    parser.add_argument("--rightwall-output", required=True, type=Path)
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

    partition = masked_copy(
        source,
        [
            [(370, 15), (418, 15), (418, 290), (370, 290)],
            [(804, 15), (850, 15), (850, 290), (804, 290)],
        ],
    )
    crosswall = masked_copy(
        source,
        [
            [(42, 337), (535, 337), (535, 425), (42, 425)],
            [(680, 337), (1232, 337), (1232, 425), (680, 425)],
        ],
    )
    rightwall = masked_copy(
        source,
        [
            [(1200, 330), (1280, 330), (1280, 482), (1204, 482)],
            [(1204, 482), (1248, 482), (1248, 520), (1216, 520)],
            [(1240, 482), (1280, 482), (1280, 650), (1240, 650)],
        ],
    )
    frontwall = masked_copy(
        source,
        [[(8, 638), (1272, 638), (1280, 720), (0, 720)]],
    )

    args.partition_output.parent.mkdir(parents=True, exist_ok=True)
    args.crosswall_output.parent.mkdir(parents=True, exist_ok=True)
    args.rightwall_output.parent.mkdir(parents=True, exist_ok=True)
    args.frontwall_output.parent.mkdir(parents=True, exist_ok=True)
    partition.save(args.partition_output, format="PNG", optimize=True)
    crosswall.save(args.crosswall_output, format="PNG", optimize=True)
    rightwall.save(args.rightwall_output, format="PNG", optimize=True)
    frontwall.save(args.frontwall_output, format="PNG", optimize=True)
    print(
        f"Wrote {args.partition_output}, {args.crosswall_output}, "
        f"{args.rightwall_output}, and {args.frontwall_output}"
    )


if __name__ == "__main__":
    main()

"""Normalize a transparent horizontal character strip into shared-scale 64x96 frames."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--sheet-out", required=True, type=Path)
    parser.add_argument("--frames", required=True, type=int)
    parser.add_argument(
        "--split-mode",
        choices=("equal", "gaps"),
        default="equal",
        help="Split equal-width slots or detect transparent gaps between figures.",
    )
    parser.add_argument("--anchor", type=Path)
    parser.add_argument("--lock-frame1", action="store_true")
    parser.add_argument("--width", type=int, default=64)
    parser.add_argument("--height", type=int, default=96)
    parser.add_argument("--padding", type=int, default=4)
    parser.add_argument("--alpha-threshold", type=int, default=8)
    return parser.parse_args()


def crop_content(image: Image.Image, threshold: int) -> Image.Image | None:
    alpha = image.getchannel("A").point(lambda value: 255 if value > threshold else 0)
    bounds = alpha.getbbox()
    return image.crop(bounds) if bounds else None


def split_strip(strip: Image.Image, frames: int) -> list[Image.Image]:
    step = strip.width / frames
    return [
        strip.crop(
            (
                round(index * step),
                0,
                round((index + 1) * step),
                strip.height,
            )
        )
        for index in range(frames)
    ]


def split_strip_by_gaps(
    strip: Image.Image,
    frames: int,
    threshold: int,
) -> list[Image.Image]:
    """Split a generated strip using transparent columns between figures."""
    alpha = strip.getchannel("A")
    minimum_column_pixels = max(3, round(strip.height * 0.005))
    active_columns = []
    for x in range(strip.width):
        histogram = alpha.crop((x, 0, x + 1, strip.height)).histogram()
        visible_pixels = sum(histogram[threshold + 1 :])
        active_columns.append(visible_pixels >= minimum_column_pixels)

    runs: list[tuple[int, int]] = []
    start: int | None = None
    for x, active in enumerate([*active_columns, False]):
        if active and start is None:
            start = x
        elif not active and start is not None:
            runs.append((start, x))
            start = None

    minimum_width = max(4, round(strip.width / frames * 0.2))
    runs = [(left, right) for left, right in runs if right - left >= minimum_width]
    if len(runs) != frames:
        raise ValueError(
            f"gap splitting found {len(runs)} figure runs, expected {frames}: {runs}"
        )
    return [strip.crop((left, 0, right, strip.height)) for left, right in runs]


def compose(
    content: Image.Image | None,
    width: int,
    height: int,
    padding: int,
    scale: float,
) -> Image.Image:
    frame = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    if content is None:
        return frame
    size = (
        max(1, round(content.width * scale)),
        max(1, round(content.height * scale)),
    )
    resized = content.resize(size, Image.Resampling.LANCZOS)
    x = (width - resized.width) // 2
    y = height - padding - resized.height
    frame.alpha_composite(resized, (x, y))
    return frame


def main() -> None:
    args = parse_args()
    if args.frames < 1:
        raise ValueError("--frames must be positive")
    if args.lock_frame1 and not args.anchor:
        raise ValueError("--lock-frame1 requires --anchor")

    strip = Image.open(args.input).convert("RGBA")
    slots = (
        split_strip_by_gaps(strip, args.frames, args.alpha_threshold)
        if args.split_mode == "gaps"
        else split_strip(strip, args.frames)
    )
    contents = [crop_content(slot, args.alpha_threshold) for slot in slots]

    anchor_image = Image.open(args.anchor).convert("RGBA") if args.anchor else None
    anchor_content = crop_content(anchor_image, args.alpha_threshold) if anchor_image else None
    visible = [content for content in [*contents, anchor_content] if content is not None]
    if not visible:
        raise ValueError("input strip contains no visible pixels")

    max_width = max(image.width for image in visible)
    max_height = max(image.height for image in visible)
    scale = min(
        (args.width - args.padding * 2) / max_width,
        (args.height - args.padding * 2) / max_height,
    )

    args.out_dir.mkdir(parents=True, exist_ok=True)
    normalized: list[Image.Image] = []
    for index, content in enumerate(contents):
        if index == 0 and args.lock_frame1 and anchor_image is not None:
            frame = anchor_image.copy()
            if frame.size != (args.width, args.height):
                frame = compose(
                    anchor_content,
                    args.width,
                    args.height,
                    args.padding,
                    scale,
                )
        else:
            frame = compose(content, args.width, args.height, args.padding, scale)
        frame.save(args.out_dir / f"{index + 1:02d}.png", optimize=True)
        normalized.append(frame)

    sheet = Image.new("RGBA", (args.width * args.frames, args.height), (0, 0, 0, 0))
    for index, frame in enumerate(normalized):
        sheet.alpha_composite(frame, (index * args.width, 0))
    args.sheet_out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.sheet_out, optimize=True)

    bounds = [frame.getchannel("A").getbbox() for frame in normalized]
    print(f"Wrote {args.sheet_out} at {sheet.size}; frame bounds={bounds}")


if __name__ == "__main__":
    main()

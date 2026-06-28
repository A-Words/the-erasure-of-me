"""Prepare transparent Rain Station environment overlays."""

from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

WIDTH = 1280
HEIGHT = 720
OUTPUT_DIR = Path("public/assets/environments")
RAIN_OUTPUT = OUTPUT_DIR / "environment_rain_rain_overlay_v01.png"
PUDDLE_OUTPUT = OUTPUT_DIR / "environment_rain_puddle_reflection_overlay_v01.png"


def draw_rain_overlay() -> Image.Image:
    rng = random.Random(245)
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")

    for _ in range(145):
        x = rng.randint(-80, WIDTH + 80)
        y = rng.randint(-40, HEIGHT + 40)
        length = rng.randint(34, 76)
        slant = rng.randint(-7, -2)
        alpha = rng.randint(28, 62)
        width = 1 if rng.random() < 0.86 else 2
        draw.line(
            [(x, y), (x + slant, y + length)],
            fill=(218, 232, 235, alpha),
            width=width,
        )

    for _ in range(34):
        x = rng.randint(0, WIDTH)
        y = rng.randint(0, HEIGHT)
        length = rng.randint(58, 96)
        slant = rng.randint(-9, -4)
        draw.line(
            [(x, y), (x + slant, y + length)],
            fill=(236, 244, 243, rng.randint(52, 82)),
            width=1,
        )

    return overlay.filter(ImageFilter.GaussianBlur(0.18))


def draw_puddle_reflection_overlay() -> Image.Image:
    rng = random.Random(425)
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")

    puddles = [
        (140, 610, 185, 22, 9),
        (334, 536, 240, 25, 8),
        (590, 448, 300, 30, -5),
        (830, 332, 286, 24, -8),
        (1045, 228, 220, 20, -10),
        (1088, 592, 340, 28, -6),
    ]
    for cx, cy, w, h, angle in puddles:
        for index in range(5):
            inset = index * 10
            alpha = max(10, 42 - index * 7)
            bbox = (
                cx - w // 2 + inset,
                cy - h // 2 + inset // 5,
                cx + w // 2 - inset,
                cy + h // 2 - inset // 5,
            )
            draw.ellipse(bbox, fill=(164, 190, 197, alpha))
        for _ in range(5):
            length = rng.randint(42, 112)
            x = cx + rng.randint(-w // 3, w // 3)
            y = cy + rng.randint(-h // 2, h // 2)
            dx = round(math.cos(math.radians(angle)) * length)
            dy = round(math.sin(math.radians(angle)) * length * 0.25)
            draw.line(
                [(x - dx // 2, y - dy // 2), (x + dx // 2, y + dy // 2)],
                fill=(226, 220, 186, rng.randint(18, 34)),
                width=1,
            )

    return overlay.filter(ImageFilter.GaussianBlur(2.0))


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    draw_rain_overlay().save(RAIN_OUTPUT, format="PNG", optimize=True)
    draw_puddle_reflection_overlay().save(PUDDLE_OUTPUT, format="PNG", optimize=True)
    print(f"Wrote {RAIN_OUTPUT}")
    print(f"Wrote {PUDDLE_OUTPUT}")


if __name__ == "__main__":
    main()

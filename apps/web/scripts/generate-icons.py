"""Derive Lumio's static icons from the unmodified owner-supplied PNG.

Requires Pillow for regeneration only; generated assets are committed and the web
build has no Python dependency. Run scripts/generate-icons.ps1 on Windows.
"""

from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "brand" / "lumio-logo-master.png"
PUBLIC = ROOT / "public"
GRAPHITE = (13, 15, 14, 255)


def render(mark: Image.Image, size: int, fill: float, background: tuple[int, int, int, int] | None) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), background or (0, 0, 0, 0))
    limit = round(size * fill)
    fitted = ImageOps.contain(mark, (limit, limit), Image.Resampling.LANCZOS)
    canvas.alpha_composite(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
    return canvas


def main() -> None:
    original = Image.open(MASTER).convert("RGBA")
    # The source contains a few almost invisible (alpha=1) fringe pixels far
    # outside the actual mark. Crop only the derived assets at alpha>=8.
    bounds = original.getchannel("A").point(lambda alpha: 255 if alpha >= 8 else 0).getbbox()
    if bounds is None:
        raise ValueError("The official logo has no visible pixels")
    mark = original.crop(bounds)
    definitions = (
        ("brand/lumio-symbol-128.png", 128, 0.96, None),
        ("favicon-16.png", 16, 0.94, None),
        ("favicon-32.png", 32, 0.94, None),
        ("icon-192.png", 192, 0.72, GRAPHITE),
        ("icon-512.png", 512, 0.72, GRAPHITE),
        ("icon-maskable-512.png", 512, 0.59, GRAPHITE),
        ("apple-touch-icon.png", 180, 0.72, GRAPHITE),
    )
    for filename, size, fill, background in definitions:
        target = PUBLIC / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        render(mark, size, fill, background).save(target, "PNG", optimize=True)
        print(f"{target.relative_to(ROOT)}: {size}x{size}")


if __name__ == "__main__":
    main()

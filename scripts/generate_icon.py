"""Render the Rook mark to PNG (requires Pillow).

assets/rook.svg is the editable source. This renderer understands only what the SVG
contains: <rect> elements (x, y, width, height, rx) and <path> elements made of M/L/Z
polygons, each with a literal fill. Curves, groups, strokes and gradients are not supported.

Run: python3 scripts/generate_icon.py
Then: npm run tauri icon assets/rook.png   (writes the bundle icons to src-tauri/icons)
"""
from pathlib import Path
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "rook.svg"


def render(size: int) -> Image.Image:
    scale = size * 4 / 1024
    image = Image.new("RGBA", (size * 4, size * 4))
    draw = ImageDraw.Draw(image)
    for shape in ET.parse(SOURCE).getroot():
        tag = shape.tag.rsplit("}", 1)[-1]
        if tag == "rect":
            x, y, width, height, radius = (
                float(shape.attrib[k]) * scale for k in ("x", "y", "width", "height", "rx")
            )
            draw.rounded_rectangle((x, y, x + width, y + height), radius, fill=shape.attrib["fill"])
        elif tag == "path":
            coords = shape.attrib["d"].replace("M", "").replace("L", "").replace("Z", "").split()
            values = [float(v) * scale for v in coords]
            draw.polygon(list(zip(values[::2], values[1::2])), fill=shape.attrib["fill"])
    return image.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    assets = ROOT / "assets"
    render(1024).save(assets / "rook.png")
    render(64).save(assets / "rook-64.png")


if __name__ == "__main__":
    main()

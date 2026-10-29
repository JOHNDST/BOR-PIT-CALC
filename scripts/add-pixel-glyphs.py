"""Add Σ, ² and ³ to the Pixel Operator fonts and write woff2 files for the web app.

Pixel Operator (CC0, by Jayvee Enaguas) has no Σ or superscript digits, which the borrow pit
formula needs. The new glyphs are drawn on the font's own 100-unit pixel grid.

usage: python3 scripts/add-pixel-glyphs.py assets/fonts-src src/fonts
"""

import sys
from pathlib import Path

from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

PX = 100  # font units per pixel in the 16px faces (unitsPerEm 1600)

# rows top to bottom; the bottom row sits on the baseline
REGULAR = {
    0x03A3: ["#####", "#....", ".#...", "..#..", "...#.", "..#..", ".#...", "#....", "#####"],
    0x00B2: ["##.", "..#", ".#.", "#..", "###"],
    0x00B3: ["##.", "..#", ".#.", "..#", "##."],
}
BOLD = {
    0x03A3: ["######", "##....", ".##...", "..##..", "...##.", "..##..", ".##...", "##....", "######"],
    0x00B2: ["###.", "..##", ".##.", "##..", "####"],
    0x00B3: ["###.", "..##", ".##.", "..##", "###."],
}
NAMES = {0x03A3: "Sigma", 0x00B2: "twosuperior", 0x00B3: "threesuperior"}
CAP_TOP = 8  # top row index of a capital letter


def draw(rows: list[str], top: int):
    pen = TTGlyphPen(None)
    for i, row in enumerate(rows):
        y = (top - i) * PX
        x = 0
        while x < len(row):
            if row[x] != "#":
                x += 1
                continue
            start = x
            while x < len(row) and row[x] == "#":
                x += 1
            # one clockwise rectangle per horizontal run of pixels, offset one pixel for the side bearing
            x0, x1 = (start + 1) * PX, (x + 1) * PX
            pen.moveTo((x0, y))
            pen.lineTo((x0, y + PX))
            pen.lineTo((x1, y + PX))
            pen.lineTo((x1, y))
            pen.closePath()
    return pen.glyph()


def patch(src: Path, out_dir: Path) -> None:
    font = TTFont(src)
    bold = "Bold" in src.stem
    mono = "Mono" in src.stem
    shapes = BOLD if bold else REGULAR
    order = font.getGlyphOrder()
    cmap_tables = [t for t in font["cmap"].tables if t.isUnicode()]
    for cp, rows in shapes.items():
        name = NAMES[cp]
        if any(cp in t.cmap for t in cmap_tables):
            continue
        glyph = draw(rows, CAP_TOP)
        glyph.recalcBounds(font["glyf"])
        width = len(rows[0]) + 2
        adv = font["hmtx"]["zero"][0] if mono else width * PX
        order.append(name)
        font["glyf"][name] = glyph
        font["hmtx"][name] = (adv, glyph.xMin)
        for t in cmap_tables:
            t.cmap[cp] = name
    font.setGlyphOrder(order)
    out_dir.mkdir(parents=True, exist_ok=True)
    font.flavor = "woff2"
    font.save(out_dir / f"{src.stem}.woff2")


if __name__ == "__main__":
    src_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    for f in sorted(src_dir.glob("PixelOperator*.ttf")):
        if "8" in f.stem:
            font = TTFont(f)
            font.flavor = "woff2"
            out_dir.mkdir(parents=True, exist_ok=True)
            font.save(out_dir / f"{f.stem}.woff2")  # headings only, no extra glyphs needed
        else:
            patch(f, out_dir)
        print("wrote", out_dir / f"{f.stem}.woff2")

#!/usr/bin/env python3
"""Generate the Harvey app icon assets (direction H2·b "Encre et pierre · Section").

What it writes and how to use it: see README.md next to this script.
"""
from __future__ import annotations

import math
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
RASTER = 1024  # every SVG is rasterised once at this size, then downsampled

# --- Geometry (100 x 100 design grid; scaled to 1024 on export) -------------
# Every path is derived from these parameters, so the nib, its shade facet and the
# menu-bar glyph stay aligned when one of them changes.

NIB_TOP, NIB_HALF_W = 29, 16                 # flat top edge, x from 34 to 66
NIB_CTRL = ((60.7, 61.5), (66, 46))          # right flank's Bézier controls (from the tip up)
NIB_SHOULDER = (50.52, 86.7)                 # where the right flank meets the rounded tip
NIB_TIP_CTRL_Y = 88.1                        # control point of the rounded tip (apex ≈ 87.4)

# Breather + slit (one contour, see hole()).
MAIN_HOLE = dict(cy=57, r=3.4, top_hw=0.64, bottom_hw=0.12, bottom_y=81.5, point=0.8)
# 18 pt menu-bar glyph: bigger breather, wider slit, flat end.
TEMPLATE_HOLE = dict(cy=56, r=4.8, top_hw=1.3, bottom_hw=0.3, bottom_y=83.5, point=0)

LEFT_ENGRAVING = "M38.4 34.5 C38.9 46 42.7 58 47.7 72"
BREATHER_ARC = "M44.6 49 Q50 45.8 55.4 49"
SECTION = "M33 14.5 Q33 12 35.5 12 L64.5 12 Q67 12 67 14.5 L66.6 30 Q50 35.2 33.4 30 Z"
SECTION_TOP, SECTION_X = 12, (33, 67)
SECTION_LINE = "M34.2 27.2 Q50 32 65.8 27.2"

TEMPLATE_SECTION_LIFT = 6.5   # gap between section and nib in the menu-bar glyph
TEMPLATE_PADDING = 2.5        # room around the glyph inside its square image

CX = 50  # vertical axis of symmetry


def f(v: float) -> str:
    return f"{v:.3f}".rstrip("0").rstrip(".")


def mirror(x: float) -> float:
    return 2 * CX - x


def tip_apex() -> tuple[float, float]:
    """Midpoint (t = 0.5) of the tip's quadratic curve."""
    _, sy = NIB_SHOULDER
    return CX, 0.5 * sy + 0.5 * NIB_TIP_CTRL_Y


def nib_outline() -> str:
    (c1x, c1y), (c2x, c2y) = NIB_CTRL
    sx, sy = NIB_SHOULDER
    left, right = CX - NIB_HALF_W, CX + NIB_HALF_W
    return (f"M{f(left)} {f(NIB_TOP)} C{f(left)} {f(c2y)} {f(mirror(c1x))} {f(c1y)} {f(mirror(sx))} {f(sy)} "
            f"Q{f(CX)} {f(NIB_TIP_CTRL_Y)} {f(sx)} {f(sy)} "
            f"C{f(c1x)} {f(c1y)} {f(c2x)} {f(c2y)} {f(right)} {f(NIB_TOP)} Z")


def hole_joint(h: dict) -> float:
    """y where the slit's top corners meet the breather circle."""
    return h["cy"] + math.sqrt(h["r"] ** 2 - h["top_hw"] ** 2)


def hole(h: dict) -> str:
    """Breather and slit as ONE contour: two overlapping holes would cancel each other
    where they meet. It winds opposite to the outline, so it cuts under both even-odd and
    non-zero fill rules. With `point`, the slit tapers to a point below `bottom_y`."""
    jy, r, hw, bhw, by = hole_joint(h), h["r"], h["top_hw"], h["bottom_hw"], h["bottom_y"]
    end = f"L{f(CX)} {f(by + h['point'])} " if h["point"] else ""
    return (f"M{f(CX - hw)} {f(jy)} A{f(r)} {f(r)} 0 1 1 {f(CX + hw)} {f(jy)} "
            f"L{f(CX + bhw)} {f(by)} {end}L{f(CX - bhw)} {f(by)} Z")


def facet(h: dict) -> str:
    """Right half of the nib minus the right half of the hole (the shade facet)."""
    (c1x, c1y), (c2x, c2y) = NIB_CTRL
    sx, sy = NIB_SHOULDER
    _, apex_y = tip_apex()
    cy, r, jy = h["cy"], h["r"], hole_joint(h)
    return (f"M{f(CX)} {f(NIB_TOP)} L{f(CX + NIB_HALF_W)} {f(NIB_TOP)} "
            f"C{f(c2x)} {f(c2y)} {f(c1x)} {f(c1y)} {f(sx)} {f(sy)} "
            f"Q{f((CX + sx) / 2)} {f(apex_y)} {f(CX)} {f(apex_y)} "
            f"L{f(CX)} {f(h['bottom_y'] + h['point'])} L{f(CX + h['bottom_hw'])} {f(h['bottom_y'])} "
            f"L{f(CX + h['top_hw'])} {f(jy)} A{f(r)} {f(r)} 0 0 0 {f(CX + r)} {f(cy)} "
            f"A{f(r)} {f(r)} 0 0 0 {f(CX)} {f(cy - r)} Z")


def mirror_path(d: str) -> str:
    """Mirror a path made only of absolute M/C/Q/L commands across the vertical axis."""
    out, coord = [], 0
    for tok in re.findall(r"[MCQL]|-?[\d.]+", d):
        if tok.isalpha():
            out.append(tok)
            coord = 0
        else:
            out.append(f(mirror(float(tok))) if coord % 2 == 0 else tok)
            coord += 1
    return " ".join(out)


ENGRAVINGS = [LEFT_ENGRAVING, mirror_path(LEFT_ENGRAVING), BREATHER_ARC]

# --- Appearances --------------------------------------------------------------
# The single source for the colours; README.md points here.

APPEARANCES = {
    "default": dict(
        bg=("#FCFAF6", "#E4DCCF"), nib=("#9A3140", "#561520"),
        facet="#28060C", facet_op=0.32, engr="#FFD6DB", engr_op=0.42,
        section=("#463C38", "#171312"), line="#FFFFFF", line_op=0.16,
    ),
    "dark": dict(
        bg=("#2B2321", "#131010"), nib=("#C94B5B", "#7A1F2B"),
        facet="#1E040A", facet_op=0.30, engr="#FFDCE0", engr_op=0.40,
        section=("#5A4F49", "#2E2724"), line="#FFFFFF", line_op=0.20,
    ),
}

# --- SVG building -------------------------------------------------------------


def linear_gradient(gid: str, direction: tuple, colours: tuple) -> str:
    x1, y1, x2, y2 = direction
    return (f'  <linearGradient id="{gid}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">'
            f'<stop offset="0" stop-color="{colours[0]}"/><stop offset="1" stop-color="{colours[1]}"/>'
            f"</linearGradient>")


# Gradient ids are distinct from the group ids ("nib", "section"): a duplicate id makes
# url(#…) ambiguous, and some importers then drop the filled shape.
def defs(a: dict) -> str:
    return "\n".join([
        "<defs>",
        linear_gradient("grad-bg", (0, 0, 0, 1), a["bg"]),
        linear_gradient("grad-nib", (0.15, 0, 0.85, 1), a["nib"]),
        linear_gradient("grad-sec", (0, 0, 1, 0), a["section"]),
        "</defs>",
    ])


def background(rx: float = 0) -> str:
    return f'<rect width="100" height="100" rx="{rx}" fill="url(#grad-bg)"/>'


def nib_group(a: dict) -> str:
    engr = "\n".join(
        f'  <path d="{d}" fill="none" stroke="{a["engr"]}" stroke-opacity="{a["engr_op"]}" '
        f'stroke-width="0.7" stroke-linecap="round"/>'
        for d in ENGRAVINGS
    )
    return f"""<g id="nib">
  <path d="{nib_outline()} {hole(MAIN_HOLE)}" fill="url(#grad-nib)" fill-rule="evenodd"/>
  <path d="{facet(MAIN_HOLE)}" fill="{a['facet']}" fill-opacity="{a['facet_op']}"/>
{engr}
</g>"""


def section_group(a: dict) -> str:
    return f"""<g id="section">
  <path d="{SECTION}" fill="url(#grad-sec)"/>
  <path d="{SECTION_LINE}" fill="none" stroke="{a['line']}" stroke-opacity="{a['line_op']}" stroke-width="0.6" stroke-linecap="round"/>
</g>"""


def flat_icon(a: dict) -> str:
    """The whole icon in one picture, with the rounded-square mask (previews, .icns)."""
    return "\n".join([defs(a), background(rx=22.5), nib_group(a), section_group(a)])


def svg(body: str, view: str = "0 0 100 100", size: int = RASTER) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="{view}">\n'
        f"{body}\n</svg>\n"
    )


def write(path: Path, text: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def rasterise(body: str, view: str, outputs: dict[Path, int]) -> None:
    """Render `body` once at RASTER px with macOS `sips` (Core SVG: clean gradients and
    alpha), then write each output size; files of the same size are copied, not re-rendered.
    ImageMagick does the downsampling because its Lanczos filter keeps small sizes crisp."""
    with tempfile.TemporaryDirectory() as tmp:
        src, big = Path(tmp) / "in.svg", Path(tmp) / "big.png"
        src.write_text(svg(body, view), encoding="utf-8")
        done = subprocess.run(["sips", "-s", "format", "png", str(src), "--out", str(big)],
                              capture_output=True, text=True)
        if done.returncode != 0 or not big.exists():
            raise SystemExit(f"sips could not render:\n{done.stderr or done.stdout}")
        by_size: dict[int, Path] = {}
        for dst, px in outputs.items():
            dst.parent.mkdir(parents=True, exist_ok=True)
            if px in by_size:
                shutil.copyfile(by_size[px], dst)
            elif px == RASTER:
                shutil.copyfile(big, dst)
            else:
                subprocess.run(["magick", str(big), "-filter", "Lanczos", "-resize", f"{px}x{px}", str(dst)],
                               check=True)
            by_size.setdefault(px, dst)


def template_view() -> str:
    """Square viewBox around the menu-bar glyph's content, with TEMPLATE_PADDING around it."""
    top = SECTION_TOP - TEMPLATE_SECTION_LIFT
    bottom = tip_apex()[1]
    side = max(bottom - top, SECTION_X[1] - SECTION_X[0]) + 2 * TEMPLATE_PADDING
    x0 = CX - side / 2
    y0 = (top + bottom) / 2 - side / 2
    return f"{f(x0)} {f(y0)} {f(side)} {f(side)}"


def main() -> None:
    missing = [tool for tool in ("sips", "magick", "iconutil") if not shutil.which(tool)]
    if missing:
        raise SystemExit(f"Missing required tool(s): {', '.join(missing)} (macOS sips/iconutil, ImageMagick magick).")

    # 1-2. Per appearance: Icon Composer layers (full bleed: the system applies the
    #      squircle mask; layers/ = Default, layers/dark/ = Dark) and a flattened preview.
    for name, ap in APPEARANCES.items():
        out = HERE / "layers" if name == "default" else HERE / "layers" / name
        write(out / "0-background.svg", svg(defs(ap) + "\n" + background()))
        write(out / "1-nib.svg", svg(defs(ap) + "\n" + nib_group(ap)))
        write(out / "2-section.svg", svg(defs(ap) + "\n" + section_group(ap)))
        write(HERE / f"preview/harvey-icon-{name}.svg", svg(flat_icon(ap)))
        rasterise(flat_icon(ap), "0 0 100 100", {HERE / f"preview/harvey-icon-{name}-1024.png": RASTER})

    # 3. Menu bar template image (black + alpha only; macOS tints it). Simplified for 18 pt:
    #    bigger breather and slit, and a visible gap between the section and the nib.
    tmpl_body = (
        f'<path d="{nib_outline()} {hole(TEMPLATE_HOLE)}" fill="#000" fill-rule="evenodd"/>\n'
        f'<path d="{SECTION}" transform="translate(0 {f(-TEMPLATE_SECTION_LIFT)})" fill="#000"/>'
    )
    view = template_view()
    write(HERE / "menubar/harvey-menubar-template.svg", svg(tmpl_body, view, size=18))
    rasterise(tmpl_body, view, {
        HERE / "menubar/harvey-menubarTemplate.png": 18,
        HERE / "menubar/harvey-menubarTemplate@2x.png": 36,
    })

    # 4. Fallback .icns for macOS 14-15: classic grid, 824 px body centred in 1024.
    legacy_body = f'<g transform="translate(100 100) scale(8.24)">\n{flat_icon(APPEARANCES["default"])}\n</g>'
    write(HERE / "preview/harvey-icon-macos14.svg", svg(legacy_body, "0 0 1024 1024"))
    with tempfile.TemporaryDirectory() as tmp:
        iconset = Path(tmp) / "Harvey.iconset"
        sizes = {}
        for base in (16, 32, 128, 256, 512):
            sizes[iconset / f"icon_{base}x{base}.png"] = base
            sizes[iconset / f"icon_{base}x{base}@2x.png"] = base * 2
        rasterise(legacy_body, "0 0 1024 1024", sizes)
        subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(HERE / "Harvey.icns")], check=True)

    print("Icon assets written to", HERE)


if __name__ == "__main__":
    main()

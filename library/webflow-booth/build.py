#!/usr/bin/env python3
"""
Build the Uploadcare TV show.

Reads the editable template in src/index.template.html and inlines every asset
(fonts, logo, globe, photos) into a single self-contained HTML file written to
dist/uploadcare-show.html. That output is what you open on the fair TV — one
file, no network, no build step at run time.

Usage:
    pip install -r requirements.txt      # once (only needs Pillow)
    python build.py                      # writes dist/uploadcare-show.html
    python build.py --watch              # rebuild on any change under src/ or assets/

Swap a photo, tweak the template, or drop in a new logo, then rebuild.
"""

import base64
import io
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src" / "index.template.html"
OUT = ROOT / "dist" / "uploadcare-show.html"
PHOTOS = ROOT / "assets" / "photos"
BRAND = ROOT / "assets" / "brand"
FONTS = ROOT / "assets" / "fonts"

BG = (9, 9, 9)  # #090909 — matte the photos onto the deck background

# Photo -> display target width in px (roughly 2x on-screen size for crispness).
# JPEG for photos (matted onto BG, corners rounded by CSS); PNG for the DOCX
# icon because it needs real transparency.
PHOTO_SPEC = {
    "tennis":   ("tennis.png",   560, "jpeg"),
    "blonde":   ("portrait.png", 460, "jpeg"),
    "car":      ("car.png",      560, "jpeg"),
    "docx":     ("docx.png",     300, "png"),
}
JPEG_QUALITY = 84


def encode_photos() -> str:
    """Resize + compress every photo and return a JSON string of data URIs."""
    from PIL import Image
    out = {}
    for key, (fname, width, fmt) in PHOTO_SPEC.items():
        im = Image.open(PHOTOS / fname).convert("RGBA")
        h = round(im.height * width / im.width)
        if fmt == "jpeg":
            bg = Image.new("RGB", im.size, BG)
            bg.paste(im, mask=im.split()[-1])
            bg = bg.resize((width, h), Image.LANCZOS)
            buf = io.BytesIO()
            bg.save(buf, "JPEG", quality=JPEG_QUALITY, optimize=True)
            mime = "image/jpeg"
        else:
            im = im.resize((width, h), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, "PNG", optimize=True)
            mime = "image/png"
        b64 = base64.b64encode(buf.getvalue()).decode()
        out[key] = f"data:{mime};base64,{b64}"
    return json.dumps(out)


def encode_fonts() -> str:
    """Return the @font-face CSS with the woff2 files embedded as data URIs."""
    css = ""
    for weight in (400, 500):
        data = (FONTS / f"commit-mono-{weight}.woff2").read_bytes()
        b64 = base64.b64encode(data).decode()
        css += (
            "@font-face{font-family:'Commit Mono';font-style:normal;"
            f"font-weight:{weight};font-display:swap;"
            f"src:url(data:font/woff2;base64,{b64}) format('woff2');}}\n"
        )
    return css


def encode_variable_font() -> str:
    """Inter Variable, embedded as a single ranged @font-face (wght 100-900).

    This is what unlocks the font-weight-morph text animation — the browser
    picks any intermediate weight along the variable axis when CSS animates
    font-weight, no font-variation-settings tricks needed.
    """
    data = (FONTS / "inter-variable.woff2").read_bytes()
    b64 = base64.b64encode(data).decode()
    return (
        "@font-face{font-family:'Inter';font-style:normal;"
        "font-weight:100 900;font-display:swap;"
        f"src:url(data:font/woff2;base64,{b64}) format('woff2');}}\n"
    )


def encode_jbmono() -> str:
    """JetBrains Mono, embedded like Commit Mono so nothing needs the network."""
    css = ""
    for weight in (400, 500):
        data = (FONTS / f"jetbrains-mono-{weight}.woff2").read_bytes()
        b64 = base64.b64encode(data).decode()
        css += (
            "@font-face{font-family:'JetBrains Mono';font-style:normal;"
            f"font-weight:{weight};font-display:swap;"
            f"src:url(data:font/woff2;base64,{b64}) format('woff2');}}\n"
        )
    return css


def encode_uploader() -> str:
    """Return a JSON map of the upload-demo assets as data URIs.

    These live in assets/photos alongside the board photos but are handled
    separately: the three uploader states + cursor are SVG (kept crisp as
    data-URI SVG), and the dragged photo is a small PNG. The upload-demo
    slide (R.upload / setupUpload) swaps and animates these at run time.
    """
    def uri(fname: str, mime: str) -> str:
        b64 = base64.b64encode((PHOTOS / fname).read_bytes()).decode()
        return f"data:{mime};base64,{b64}"

    svg = "image/svg+xml"
    out = {
        "cursor":    uri("Cursor.svg", svg),
        "photo":     uri("Image.png", "image/png"),
        "static":    uri("Uploader-static.svg", svg),
        "hover":     uri("Uploader-hover.svg", svg),
        "uploading": uri("Uploader-Uploading.svg", svg),
        "tag":       uri("File-uploaded.svg", svg),
        "nodes":     uri("file-uploaded-nodes.svg", svg),
    }
    return json.dumps(out)


def encode_pixel_reveal() -> str:
    """Parse the dot-halftone SVG into compact data + inline the full photo.

    Pixelated-image.svg is a variable-dot halftone of Full-image.png: ~2255
    little squares whose *size* and grey value encode the picture. Rather than
    drop 2255 SVG nodes into the DOM, we extract each dot as [cx, cy, size, grey]
    and let the reveal slide paint them on a single <canvas> (startPixelReveal)
    — the dots materialise, twinkle, then dissolve to unveil the real photo.
    """
    from PIL import Image

    svg = (PHOTOS / "Pixelated-image.svg").read_text()
    m = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', svg)
    vw, vh = (float(m.group(1)), float(m.group(2))) if m else (628.0, 842.0)

    # each dot is a rect drawn as: M x2 y1 H x1 V y2 H x2 V y1 Z  fill="#rrggbb"
    dot_re = re.compile(
        r'd="M([-\d.]+) ([-\d.]+)H([-\d.]+)V([-\d.]+)[^"]*"\s*fill="#([0-9A-Fa-f]{3,6})"'
    )
    dots = []
    for mm in dot_re.finditer(svg):
        x2, y1, x1, y2, hexv = mm.groups()
        x2, y1, x1, y2 = float(x2), float(y1), float(x1), float(y2)
        if len(hexv) == 3:
            hexv = "".join(c * 2 for c in hexv)
        grey = int(hexv[0:2], 16)  # halftone is greyscale, R==G==B
        cx = round((x1 + x2) / 2, 1)
        cy = round((y1 + y2) / 2, 1)
        size = round(abs(x2 - x1), 1)
        dots.append([cx, cy, size, grey])

    # the full photo, matted + compressed like the board photos
    im = Image.open(PHOTOS / "Full-image.png").convert("RGBA")
    W = 660
    H = round(im.height * W / im.width)
    bg = Image.new("RGB", im.size, BG)
    bg.paste(im, mask=im.split()[-1])
    bg = bg.resize((W, H), Image.LANCZOS)
    buf = io.BytesIO()
    bg.save(buf, "JPEG", quality=JPEG_QUALITY, optimize=True)
    img = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

    return json.dumps({"w": vw, "h": vh, "img": img, "dots": dots},
                      separators=(",", ":"))


def minify_svg(path: Path) -> str:
    """Collapse newlines so the SVG lives happily inside a <script> tag."""
    return re.sub(r"\n+", "", path.read_text())


def prepare_glyph() -> str:
    """Uploadcare pixel glyph, sized by CSS (fixed width/height dropped)."""
    svg = minify_svg(PHOTOS / "uploadcare-logo-glyph.svg")
    svg = re.sub(r'\swidth="\d+"\sheight="\d+"', ' ', svg, count=1)
    return svg


def prepare_logo() -> str:
    """Logo lockup, made responsive (height driven by CSS)."""
    svg = minify_svg(BRAND / "uploadcare-logo-lockup.svg")
    # let CSS control the size: viewBox stays, fixed width/height dropped
    svg = re.sub(r'\swidth="\d+"\sheight="\d+"', ' height="100%" ', svg, count=1)
    return svg


def build() -> None:
    html = SRC.read_text()

    replacements = {
        "/*__COMMIT_MONO__*/": encode_fonts(),
        "/*__INTER_VAR__*/":   encode_variable_font(),
        "/*__JB_MONO__*/":     encode_jbmono(),
        "__LOGO_SVG__":        prepare_logo(),
        "__GLYPH_SVG__":       prepare_glyph(),
        "__GLOBE_SVG__":       minify_svg(BRAND / "globe.svg"),
        "__ASSETS_JSON__":     encode_photos(),
        "__UPLOADER_JSON__":   encode_uploader(),
        "__PIXEL_JSON__":      encode_pixel_reveal(),
    }
    for token, value in replacements.items():
        if token not in html:
            raise SystemExit(f"ERROR: token {token!r} not found in template")
        html = html.replace(token, value)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html)
    print(f"built {OUT.relative_to(ROOT)}  ({len(html):,} bytes)")


def watch() -> None:
    watched = list((ROOT / "src").rglob("*")) + list((ROOT / "assets").rglob("*"))
    mtimes = {p: p.stat().st_mtime for p in watched if p.is_file()}
    build()
    print("watching for changes… (Ctrl-C to stop)")
    try:
        while True:
            time.sleep(0.6)
            changed = False
            for p in (ROOT / "src").rglob("*"):
                if p.is_file() and mtimes.get(p) != p.stat().st_mtime:
                    mtimes[p] = p.stat().st_mtime
                    changed = True
            for p in (ROOT / "assets").rglob("*"):
                if p.is_file() and mtimes.get(p) != p.stat().st_mtime:
                    mtimes[p] = p.stat().st_mtime
                    changed = True
            if changed:
                try:
                    build()
                except SystemExit as e:
                    print(e)
    except KeyboardInterrupt:
        print("\nstopped.")


if __name__ == "__main__":
    (watch if "--watch" in sys.argv else build)()

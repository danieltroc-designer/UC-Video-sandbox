#!/usr/bin/env python3
"""
Build the *simplified* Uploadcare TV show (the 7-card booth loop).

Standalone from build.py so the main deck is never touched: this reads
src/simple.template.html, inlines the same assets (reusing build.py's
encoders) plus the booth QR, and writes a separate self-contained file to
dist/uploadcare-simple.html.

Usage:
    python build_simple.py            # writes dist/uploadcare-simple.html
    python build_simple.py --watch    # rebuild on any change under src/ or assets/

To change where the booth QR sends people, replace assets/qr/booth-qr.png and
rebuild — the build decodes it and prints the destination.
"""

import base64
import json
import re
import sys
import time
from pathlib import Path

import build  # reuse every encoder + the ROOT/asset paths from the main build

ROOT = build.ROOT
SRC = ROOT / "src" / "simple.template.html"
OUT = ROOT / "dist" / "uploadcare-simple.html"
LOGOS = ROOT / "assets" / "logos"
UPLOADER_UI = ROOT / "assets" / "uploader"
DEMO = ROOT / "assets" / "demo"
CAPS = ROOT / "assets" / "caps"
MARKET = ROOT / "assets" / "marketplace"
COMPLIANCE = ROOT / "assets" / "compliance"
ECOMMERCE = ROOT / "assets" / "ecommerce"

# Card 2's capability icons, exported from the storyboard with their accent
# colours baked in — they are not a monochrome set, so they can't be recoloured
# from CSS. Keys are what FEATURES looks them up by.
CAP_ICONS = ("large-files", "multi-file", "any-source", "malware", "editor")

# Card 5's marketplace listing chrome. Only the download glyph lives here — the
# app tile reuses the deck's own Uploadcare glyph, recoloured to brand yellow
# from CSS, because it is the same mark the storyboard places there.
MARKET_ICONS = ("downloads",)

# Card 6's trust marks, in the order the storyboard lays them out.
COMPLIANCE_BADGES = ("soc2", "gdpr", "hipaa")

# The three-panel pipeline card runs on one photo and the three transforms the
# on-screen URL builds up, so the frames have to match the ops exactly:
#   crop/face -> scale_crop/460x460/center -> border_radius/50p
# They're pre-rendered by the CDN and inlined here because the deck has to run
# with no network at the booth.
DEMO_FRAMES = {
    "original": "portrait.jpg",
    "step1":    "step1-crop.jpg",
    "step2":    "step2-square.jpg",
    "step3":    "step3-round.png",
}

# Customer logos for the "Trusted by" wall, in the storyboard's order. Each is
# the isolated white vector exported from the Figma frame — not a wordmark we
# set in type, so the marks stay correct.
LOGO_ORDER = ("zapier", "soundcloud", "loreal", "sequoia",
              "usertesting", "prezly", "aryeo", "marko")

# The real uploader widget's chrome: the dropzone glyph, one icon per upload
# source, and the controls on the compact uploading panel (dismiss, per-file
# checkmark, per-file bin). Keys are what the template looks them up by. Two
# things are deliberately absent: the pointer, which reuses the deck's existing
# cursor, and the upload ring, which the template draws so its arc can fill.
UPLOADER_ICONS = {
    "upload": "icon-upload.svg", "device": "icon-device.svg",
    "camera": "icon-camera.svg", "dropbox": "icon-dropbox.svg",
    "gdrive": "icon-gdrive.svg", "link": "icon-link.svg",
    "close": "icon-close.svg", "check": "icon-check.svg",
    "trash": "icon-trash.svg",
}

# The two files that get dragged in. One photo each, exported at 240x300 — 2x
# the 120x150 drag card — and reused at 32px for the row thumbnails.
UPLOADER_THUMBS = ("thumb-flower", "thumb-flamingo")

# The card-7 QR, as supplied by design: black on white, any raster size. To
# point the booth somewhere else, replace this file — the destination lives in
# the artwork, not in this script, and the build prints what it decodes to.
QR_SRC = ROOT / "assets" / "qr" / "booth-qr.png"


def inline_svg(path: Path) -> str:
    """Minify an SVG and hand sizing over to CSS.

    Figma exports carry a fixed width/height plus preserveAspectRatio="none";
    both have to go or the mark stretches when CSS sets only one dimension.
    The viewBox survives, so the intrinsic aspect ratio still applies.

    Some exports also emit `Cnan nan x2 y2 x y` — Figma drops the first control
    point when it writes a circular arc as a cubic. Those arcs are smooth
    joins, so the missing point is exactly the reflection of the previous
    segment's second control point, which is what `S` means. The substitution
    is lossless rather than a guess.
    """
    svg = build.minify_svg(path)
    svg = re.sub(r"C\s*nan\s+nan\s+", "S", svg)
    m = re.match(r"<svg[^>]*>", svg)
    if not m:
        return svg
    head = re.sub(r'\s(?:width|height)="[\d.]+(?:px)?"', "", m.group(0))
    head = head.replace(' preserveAspectRatio="none"', "")
    return head + svg[m.end():]


def encode_logos() -> str:
    """JSON map of customer-logo name -> inline SVG, for the trusted-by wall."""
    # Scan rather than relying only on the inherited wall's fixed order. The
    # Ecommerce Expo cut adds Zephyr, Crayola, Samsonite, GemPages and Shogun as
    # their real exports arrive; dropping `<normalized-name>.svg` here is enough
    # for both the proof-point attribution and the six-logo wall to pick it up.
    return json.dumps({p.stem: inline_svg(p) for p in sorted(LOGOS.glob("*.svg"))})


def encode_uploader_ui() -> str:
    """JSON map of the uploader-widget chrome: inline SVG icons + file thumbs.

    Icons stay as inline SVG (crisp at any scale, styleable); the two dragged
    file thumbnails are photos, so they go in as base64 PNG data URIs.
    """
    out = {k: inline_svg(UPLOADER_UI / f) for k, f in UPLOADER_ICONS.items()}
    # the storyboard's cursor exported as an empty mask, so use the pointer the
    # upload-demo slide already uses — same mark, and one cursor across the deck
    out["cursor"] = inline_svg(build.PHOTOS / "Cursor.svg")
    for key in UPLOADER_THUMBS:
        b64 = base64.b64encode((UPLOADER_UI / f"{key}.png").read_bytes()).decode()
        out[key] = f"data:image/png;base64,{b64}"
    return json.dumps(out)


def encode_caps() -> str:
    """JSON map of capability-icon name -> inline SVG, for card 2's tiles."""
    return json.dumps({n: inline_svg(CAPS / f"{n}.svg") for n in CAP_ICONS})


def encode_market() -> str:
    """JSON map of marketplace-icon name -> inline SVG, for card 5's listing."""
    return json.dumps({n: inline_svg(MARKET / f"icon-{n}.svg") for n in MARKET_ICONS})


def encode_compliance() -> str:
    """JSON map of card 6's trust-mark name -> inline SVG markup."""
    return json.dumps({n: inline_svg(COMPLIANCE / f"{n}.svg") for n in COMPLIANCE_BADGES})


def encode_demo() -> str:
    """JSON map of pipeline-card frame name -> base64 data URI."""
    out = {}
    for key, name in DEMO_FRAMES.items():
        path = DEMO / name
        mime = "image/png" if path.suffix == ".png" else "image/jpeg"
        b64 = base64.b64encode(path.read_bytes()).decode()
        out[key] = f"data:{mime};base64,{b64}"
    return json.dumps(out)


def encode_ecommerce() -> str:
    """Inline Ecommerce Expo photography and card-specific vector art.

    Card 4 requires the real catalog-admin source and a genuine AI Enhancer
    output; it never manufactures a fake result in CSS. Its backend is rebuilt
    as DOM, so the two reference captures in assets/ecommerce/ are documentation
    and are deliberately not inlined. Cards 2 and 6 use required Figma exports: card 2's
    accent colours are baked into its five icons, while card 6's product image,
    expanded rail, 66.281px collapsed connector and 339x61 final lockup are its
    actual frame assets.
    """
    # stems, not filenames: remove_bg always returns PNG, while the source photo
    # and the catalog shot are usually JPG, so the extension is not knowable here
    stems = {
        "product": "product",
        "card1Product": "card1-product",
        "catalogSource": "catalog-source",
        "editorAfter": "editor-after",
        "infrastructureProduct": "infrastructure-product",
    }
    out = {}
    for key, stem in stems.items():
        found = [p for ext in (".png", ".jpg", ".jpeg")
                 if (p := ECOMMERCE / f"{stem}{ext}").exists()]
        if not found:
            continue
        path = found[0]
        mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
        out[key] = f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()
    for key in ("mobile", "conversions", "peak", "maintain", "store"):
        path = ECOMMERCE / f"benefit-{key}.svg"
        if not path.exists():
            raise SystemExit(f"ERROR: required Ecommerce Expo icon missing: {path}")
        out[f"benefit-{key}"] = inline_svg(path)
    for key in ("node", "line", "collapsed", "lockup"):
        path = ECOMMERCE / f"infrastructure-{key}.svg"
        if not path.exists():
            raise SystemExit(f"ERROR: required Ecommerce Expo path asset missing: {path}")
        out[f"infrastructure-{key}"] = inline_svg(path)
    for key in ("os", "left", "right", "back"):
        path = ECOMMERCE / f"card1-browser-{key}.svg"
        if not path.exists():
            raise SystemExit(f"ERROR: required Ecommerce Expo Card 1 asset missing: {path}")
        out[f"card1-browser-{key}"] = inline_svg(path)
    if "card1Product" not in out:
        raise SystemExit(
            f"ERROR: required Ecommerce Expo Card 1 image missing: "
            f"{ECOMMERCE / 'card1-product.jpg'}"
        )
    for key, filename in (
        ("catalogSource", "catalog-source.jpg"),
        ("editorAfter", "editor-after.jpg"),
    ):
        if key not in out:
            raise SystemExit(
                f"ERROR: required Ecommerce Expo Card 4 asset missing: "
                f"{ECOMMERCE / filename}"
            )
    if "infrastructureProduct" not in out:
        raise SystemExit(
            f"ERROR: required Ecommerce Expo product image missing: "
            f"{ECOMMERCE / 'infrastructure-product.png'}"
        )
    return json.dumps(out)


def make_qr() -> str:
    """Inline the booth QR as white vector modules on nothing.

    The designer hands over a raster (assets/qr/booth-qr.png, black on white).
    We do not embed that bitmap: the outro draws the code at 204px, and a
    scaled raster gives soft module edges — exactly what a scanner has to work
    hardest to threshold — plus it is the wrong polarity for the dark frame.
    Instead `qr_lib` recovers the module grid and re-emits it as vector
    rectangles, which are crisp at any size and recolourable.

    Deliberately *not* wrapped in a try/except. A QR is a promise about where
    it goes: if the artwork cannot be read, failing the build is right, because
    every silent fallback here — a placeholder tile, a regenerated code from
    some URL constant — ships something that looks scannable and goes
    somewhere other than intended. `read_matrix` validates finder and timing
    patterns, so a garbled source raises rather than emitting noise.
    """
    sys.path.insert(0, str(ROOT / "tools"))
    from qr_lib import read_matrix, decode, to_svg

    matrix, info = read_matrix(QR_SRC)
    payload, _, ecc, _ = decode(matrix)
    print(f"  QR: {info['n']}x{info['n']} modules (version {info['version']}, "
          f"ecc {ecc}) -> {payload}")
    # 3 modules of quiet zone inside the box. The frame's QR is a 204px node
    # holding 164px of ink, and since the box is a fixed size the only way to
    # land the ink at 164 is to pad the viewBox: 25 + 2*3 modules over 204px
    # puts a module at 6.58px and the ink at 164.5. The border draws nothing —
    # the real quiet zone is the dark frame the code sits on, which is the
    # right colour for it given the modules are inverted.
    return to_svg(matrix, fill="#ffffff", border=3)


def build_simple() -> None:
    html = SRC.read_text()

    # The main deck's token set (this template is a superset of it) plus the
    # three that only exist here: the CTA QR, the customer logos, and the
    # uploader-widget chrome.
    replacements = {
        "/*__COMMIT_MONO__*/": build.encode_fonts(),
        "/*__INTER_VAR__*/":   build.encode_variable_font(),
        "/*__JB_MONO__*/":     build.encode_jbmono(),
        "__LOGO_SVG__":        build.prepare_logo(),
        "__GLYPH_SVG__":       build.prepare_glyph(),
        "__GLOBE_SVG__":       build.minify_svg(build.BRAND / "globe.svg"),
        "__ASSETS_JSON__":     build.encode_photos(),
        "__UPLOADER_JSON__":   build.encode_uploader(),
        "__PIXEL_JSON__":      build.encode_pixel_reveal(),
        "__QR_SVG__":          make_qr(),
        "__LOGOS_JSON__":      encode_logos(),
        "__UPLOADERUI_JSON__": encode_uploader_ui(),
        "__DEMO_JSON__":       encode_demo(),
        "__CAPS_JSON__":       encode_caps(),
        "__MARKET_JSON__":     encode_market(),
        "__COMPLIANCE_JSON__": encode_compliance(),
        "__ECOMMERCE_JSON__":   encode_ecommerce(),
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
    build_simple()
    print("watching for changes… (Ctrl-C to stop)")
    try:
        while True:
            time.sleep(0.6)
            changed = False
            for base in ("src", "assets"):
                for p in (ROOT / base).rglob("*"):
                    if p.is_file() and mtimes.get(p) != p.stat().st_mtime:
                        mtimes[p] = p.stat().st_mtime
                        changed = True
            if changed:
                try:
                    build_simple()
                except SystemExit as e:
                    print(e)
    except KeyboardInterrupt:
        print("\nstopped.")


if __name__ == "__main__":
    (watch if "--watch" in sys.argv else build_simple)()

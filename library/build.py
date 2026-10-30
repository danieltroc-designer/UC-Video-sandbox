#!/usr/bin/env python3
"""
Builds every deck in the library for the sandbox.

Each deck keeps its own build (build_simple.py inlines fonts and images as
data: URLs so the booth file runs offline). Inlined, the Ecommerce deck is a
14 MB HTML file, which is slow to preview and bloats git on every rebuild. So
after each deck builds, this moves every data: URL out into media/<hash>.<ext>
next to a small deck.html. Files are content-addressed, so an unchanged image
keeps its name across rebuilds.

    python3 library/build.py                 # all decks
    python3 library/build.py ecommerce-expo  # one deck
"""

import base64
import hashlib
import re
import subprocess
import sys
from pathlib import Path

LIB = Path(__file__).resolve().parent
DECKS = ("ecommerce-expo", "webflow-booth")
EXT = {
    "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg",
    "image/gif": "gif", "font/woff2": "woff2", "font/woff": "woff", "application/font-woff2": "woff2",
}
DATA_URL = re.compile(r"data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)")


def externalise(html: str, media: Path) -> tuple[str, int, int]:
    media.mkdir(exist_ok=True)
    used, written = set(), 0

    def swap(m: re.Match) -> str:
        nonlocal written
        mime, payload = m.group(1), m.group(2)
        ext = EXT.get(mime)
        if not ext:
            return m.group(0)           # leave anything unexpected inline
        data = base64.b64decode(payload)
        name = f"{hashlib.sha1(data).hexdigest()[:16]}.{ext}"
        out = media / name
        if not out.exists():
            out.write_bytes(data)
            written += 1
        used.add(name)
        return f"media/{name}"

    html = DATA_URL.sub(swap, html)
    # drop media no longer referenced by this build
    for f in media.iterdir():
        if f.name not in used:
            f.unlink()
    return html, len(used), written


def build(deck: str) -> None:
    root = LIB / deck
    subprocess.run([sys.executable, "build_simple.py"], cwd=root, check=True)
    built = (root / "dist" / "uploadcare-simple.html").read_text()
    html, files, written = externalise(built, root / "media")
    (root / "deck.html").write_text(html)
    print(f"{deck}: deck.html {len(html) // 1024} KB + {files} media files ({written} new)")


if __name__ == "__main__":
    for deck in sys.argv[1:] or DECKS:
        build(deck)

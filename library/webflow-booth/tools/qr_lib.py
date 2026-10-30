"""Read a QR symbol out of a bitmap and write it back out as a clean SVG.

The booth QR arrives as a raster (a PNG from the designer, or a render of the
Figma node). Scaling that raster up to the 204px the outro wants gives soft,
anti-aliased module edges, which is exactly what a scanner has to work hardest
to threshold. So instead of embedding the bitmap we recover the module grid
from it and re-emit the same symbol as vector rectangles: identical code, hard
edges at any size, and recolourable.

Nothing here is QR-specific enough to need a decoder — we copy the grid, we do
not interpret it. `read_matrix` is deliberately strict about validating what it
found (finder rings, timing runs) so a misread grid fails loudly rather than
silently shipping an unscannable code.
"""

from PIL import Image

# a finder pattern: 7x7, ring of dark, light gap, 3x3 dark core
FINDER = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
]


def _ink_fn(im):
    """Return a predicate telling ink from background, whichever polarity.

    A QR can arrive dark-on-light (the usual export) or light-on-dark (the
    Figma node, drawn white on nothing). Rather than being told which, decide
    from the corners: the quiet zone is background by definition, so whatever
    the corners are, ink is the other thing.
    """
    px, (w, h) = im.load(), im.size
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg_transparent = all(c[3] < 128 for c in corners)
    bg_light = all(c[3] >= 128 and (c[0] + c[1] + c[2]) / 3 > 128 for c in corners)

    def ink(x, y):
        r, g, b, a = px[x, y]
        if bg_transparent:
            return a >= 128
        lum = r * 0.299 + g * 0.587 + b * 0.114
        return lum > 128 if not bg_light else lum < 128

    return ink


def read_matrix(path):
    """Recover the NxN module grid from a QR bitmap.

    Returns (matrix, info). Rather than trying to measure the module size off
    the artwork — anti-aliased edges make the outermost ink pixel unreliable —
    this tries every legal symbol size and keeps the one whose three finder
    patterns and both timing runs actually check out.
    """
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    ink = _ink_fn(im)

    xs = [x for x in range(w) if any(ink(x, y) for y in range(0, h, 2))]
    ys = [y for y in range(h) if any(ink(x, y) for x in range(0, w, 2))]
    if not xs or not ys:
        raise ValueError(f"{path}: no ink found")
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    side = max(x1 - x0 + 1, y1 - y0 + 1)

    for n in range(21, 178, 4):                      # versions 1..40
        step = side / n
        if step < 1:
            break
        m = [[1 if ink(min(w - 1, int(x0 + (c + .5) * step)),
                       min(h - 1, int(y0 + (r + .5) * step))) else 0
              for c in range(n)] for r in range(n)]
        if _valid(m, n):
            return m, {"origin": (x0, y0), "side": side, "module": step,
                       "n": n, "version": (n - 17) // 4}
    raise ValueError(f"{path}: could not lock onto a module grid "
                     f"(ink bbox {side}px at {x0},{y0})")


def _valid(m, n):
    for oy, ox in ((0, 0), (0, n - 7), (n - 7, 0)):
        for r in range(7):
            for c in range(7):
                if m[oy + r][ox + c] != FINDER[r][c]:
                    return False
    # timing patterns: alternating run along row 6 and column 6
    for i in range(8, n - 8):
        if m[6][i] != (1 - i % 2) or m[i][6] != (1 - i % 2):
            return False
    return True


MASKS = (
    lambda i, j: (i + j) % 2 == 0,
    lambda i, j: i % 2 == 0,
    lambda i, j: j % 3 == 0,
    lambda i, j: (i + j) % 3 == 0,
    lambda i, j: (i // 2 + j // 3) % 2 == 0,
    lambda i, j: (i * j) % 2 + (i * j) % 3 == 0,
    lambda i, j: ((i * j) % 2 + (i * j) % 3) % 2 == 0,
    lambda i, j: ((i + j) % 2 + (i * j) % 3) % 2 == 0,
)
_ECC = {1: "L", 0: "M", 3: "Q", 2: "H"}
# alignment-pattern centres by version, versions 1-10 (enough for a URL)
_ALIGN = {1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
          7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]}


def decode(matrix):
    """Decode a QR matrix far enough to read its payload.

    Deliberately does *not* do Reed-Solomon: this only ever runs against a
    clean synthetic bitmap, where the data codewords are already correct, and
    the point is to confirm what the artwork encodes rather than to be a
    general reader. It also assumes a single ECC block, which holds for
    versions 1-4 at every level — enough for a URL. A corrupted symbol will
    come back as mojibake rather than a raised error, so read the result.
    """
    n = len(matrix)
    version = (n - 17) // 4

    fmt = 0
    for i in range(6):
        fmt = (fmt << 1) | matrix[8][i]
    for r, c in ((8, 7), (8, 8), (7, 8)):
        fmt = (fmt << 1) | matrix[r][c]
    for i in range(5, -1, -1):
        fmt = (fmt << 1) | matrix[i][8]
    fmt ^= 0x5412
    ecc, mask = _ECC[(fmt >> 13) & 3], (fmt >> 10) & 7

    # everything that is structure rather than payload
    fn = [[False] * n for _ in range(n)]
    def block(r0, c0, h, w):
        for r in range(r0, r0 + h):
            for c in range(c0, c0 + w):
                if 0 <= r < n and 0 <= c < n:
                    fn[r][c] = True
    for r0, c0 in ((0, 0), (0, n - 8), (n - 8, 0)):
        block(r0, c0, 9 if r0 == 0 else 8, 9 if c0 == 0 else 8)
    block(6, 0, 1, n); block(0, 6, n, 1)                     # timing
    centres = _ALIGN.get(version, [])
    for r in centres:
        for c in centres:
            if (r < 9 and c < 9) or (r < 9 and c > n - 10) or (r > n - 10 and c < 9):
                continue
            block(r - 2, c - 2, 5, 5)

    # zigzag up/down in column pairs from the bottom right. The direction has
    # to be an explicit toggle, not derived from the column index: column 6 is
    # skipped as timing, which throws off any parity you compute from it.
    bits, col, up = [], n - 1, True
    while col > 0:
        if col == 6:
            col -= 1
        for row in (range(n - 1, -1, -1) if up else range(n)):
            for c in (col, col - 1):
                if not fn[row][c]:
                    v = matrix[row][c]
                    if MASKS[mask](row, c):
                        v ^= 1
                    bits.append(v)
        up = not up
        col -= 2

    def take(pos, count):
        v = 0
        for b in bits[pos:pos + count]:
            v = (v << 1) | b
        return v

    p, out = 0, ""
    while p + 4 <= len(bits):
        mode = take(p, 4); p += 4
        if mode == 0:
            break
        if mode == 7:
            # ECI header — a charset declaration, not content. Plenty of
            # generators prepend ECI 26 (UTF-8) before the byte segment, so a
            # reader that treats mode 7 as unsupported gives up on perfectly
            # ordinary codes. Length is self-describing in the leading bits.
            lead = take(p, 3)
            n_eci = 1 if lead >> 2 == 0 else (2 if lead >> 1 == 0b10 else 3)
            p += 8 * n_eci
            continue
        nbits = {1: 10, 2: 9, 4: 8}.get(mode)
        if nbits is None:
            return f"<unsupported mode {mode}>", version, ecc, mask
        count = take(p, nbits); p += nbits
        if mode == 4:
            out += bytes(take(p + 8 * i, 8) for i in range(count)).decode("utf-8", "replace")
            p += 8 * count
        elif mode == 2:
            AN = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:"
            for i in range(count // 2):
                v = take(p, 11); p += 11
                out += AN[v // 45] + AN[v % 45]
            if count % 2:
                out += AN[take(p, 6)]; p += 6
        else:
            for i in range(count // 3):
                out += f"{take(p, 10):03d}"; p += 10
            rem = count % 3
            if rem:
                out += f"{take(p, 7 if rem == 2 else 4):0{rem}d}"; p += 7 if rem == 2 else 4
    return out, version, ecc, mask


def to_svg(matrix, fill="#ffffff", border=0):
    """Emit the grid as one SVG path, sized in module units via viewBox.

    One path of rectangular subpaths rather than one <rect> per module: a
    version-6 code is ~1700 modules, and at ~40 bytes a rect that is 70KB of
    markup to inline into a single-file deck for no benefit.
    """
    n = len(matrix)
    total = n + 2 * border
    d = []
    for r, row in enumerate(matrix):
        c = 0
        while c < n:
            if not row[c]:
                c += 1
                continue
            run = 0
            while c + run < n and row[c + run]:
                run += 1                              # merge horizontal runs
            d.append(f"M{c + border} {r + border}h{run}v1h-{run}z")
            c += run
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total} {total}" '
            f'shape-rendering="crispEdges"><path fill="{fill}" d="{"".join(d)}"/></svg>')

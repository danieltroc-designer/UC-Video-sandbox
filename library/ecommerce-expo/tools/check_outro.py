"""Measure card 7 against Ecommerce frame 219:1638.

That frame deliberately reuses the Webflow storyboard composition (184:5666),
so the geometry below remains the same while the title and sign-off change.

Also checks the two things that are easy to get wrong here and invisible in a
still: that the wireframe globe is fully on stage rather than clipped, and that
the centre glyph's pixels are sitting at different opacities rather than all
lifting together.

    python tools/check_outro.py
"""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist" / "uploadcare-simple.html"
PROFILE = ROOT / "tools" / "_profile"
CHROME = (pathlib.Path.home()
          / ".cache/ms-playwright-stable/chromium-1223/chrome-mac-arm64"
          / "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")

# selector -> (x, y, w, h) in stage px
SPEC = {
    ".hb-globe":       (61.2, 42.3, 1797.6, 995.4),
    ".hb-sign":        (867, 186, 185, 33),
    ".hb-outro-line":  (507, 320, 907, 143),
    ".hb-mark":        (916, 497, 86, 86),
    # full-width, centred; the frame's box is 776 wide at x=572, so what is
    # checked here is the height (two lines at the frame's 57) and that the
    # text lands on 960.
    ".hb-outro-sub":   (0, 640, 1920, 57.4),
    ".hb-outro-qr":    (857, 711, 204, 204),
    ".hb-node.n1 .hb-card": (272, 219, 100, 143),
    ".hb-node.n2 .hb-card": (311, 778, 105, 147),
    ".hb-node.n3 .hb-card": (1342.44, 203, 134.27, 94.72),
    ".hb-node.n4 .hb-card": (1520, 752, 67, 83),
    ".hb-node.n1 .hb-meta": (389.66, 319.66, 0, 0),   # size not pinned
    ".hb-node.n2 .hb-meta": (434.88, 778, 0, 0),
    ".hb-node.n3 .hb-meta": (1500.45, 219.38, 0, 0),
    ".hb-node.n4 .hb-meta": (1601, 754.05, 0, 0),
    ".hb-led":              (1500.45, 203, 6.72, 6.72),
}
TOL = 2.0


def main():
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE / "outro"),
            executable_path=str(CHROME) if CHROME.exists() else None,
            headless=True, viewport={"width": 1920, "height": 1080},
            reduced_motion="no-preference", args=["--no-sandbox", "--disable-gpu"])
        pg = ctx.new_page()
        pg.goto(DIST.as_uri())
        pg.wait_for_timeout(1200)
        idx = pg.evaluate("deck.slides.findIndex(s=>s.layout==='outro')")
        # the corner files drift perpetually, so their measured boxes are only
        # meaningful with the drift off — it is ±13px and a half-degree of tilt
        pg.evaluate(f"deck.slides[{idx}].float=false; renderDeck();")
        pg.evaluate(f"enter({idx}); playing=false; clearTimeout(timer); clearInterval(tickTimer);")
        pg.wait_for_timeout(4000)               # past every entrance, into the loop

        stage = pg.evaluate("document.getElementById('stage').getBoundingClientRect().toJSON()")
        sc = stage["width"] / 1920
        bad = 0
        for sel, want in SPEC.items():
            r = pg.evaluate("s=>{const e=document.querySelector('.slide.active '+s);"
                            "return e?e.getBoundingClientRect().toJSON():null}", sel)
            if not r:
                print(f"MISS {sel}")
                bad += 1
                continue
            got = ((r["x"] - stage["x"]) / sc, (r["y"] - stage["y"]) / sc,
                   r["width"] / sc, r["height"] / sc)
            n = 2 if want[2] == 0 else 4        # some entries only pin position
            off = [g - w for g, w in zip(got[:n], want[:n])]
            ok = all(abs(d) <= TOL for d in off)
            bad += not ok
            print(f"{'ok  ' if ok else 'OFF '} {sel:<24} "
                  f"got {got[0]:8.1f},{got[1]:7.1f} {got[2]:7.1f}x{got[3]:6.1f}   "
                  f"d {','.join(f'{d:+.1f}' for d in off)}")

        print()
        # the globe has to sit entirely on stage — this is the bug being fixed
        g = pg.evaluate("()=>{const e=document.querySelector('.slide.active .hb-globe');"
                        "const s=document.getElementById('stage').getBoundingClientRect();"
                        "const r=e.getBoundingClientRect();"
                        "return [r.x-s.x, r.y-s.y, r.right-s.right, r.bottom-s.bottom]}")
        clipped = [round(v / sc, 1) for v in g]
        print(f"     globe inset l,t / overhang r,b: {clipped}  "
              f"{'ok' if clipped[0] >= -0.5 and clipped[1] >= -0.5 and clipped[2] <= 0.5 and clipped[3] <= 0.5 else 'CLIPPED'}")
        # and its viewBox must cover the artwork, or it is cropped inside the box
        vb = pg.evaluate("()=>document.querySelector('.slide.active .hb-globe svg').getAttribute('viewBox')")
        bb = pg.evaluate("()=>{const b=document.querySelector('.slide.active .hb-globe svg').getBBox();"
                         "return [b.x,b.y,b.width,b.height]}")
        print(f"     globe viewBox {vb}  vs artwork bbox {[round(v,1) for v in bb]}")

        # The QR's box is checked above, but the box is mostly quiet zone: the
        # frame's 204px node holds 164px of ink. Measure the drawn modules, or
        # the code could be any size inside a box that still passes.
        ink = pg.evaluate("()=>{const s=document.querySelector('.slide.active .hb-outro-qr svg');"
                          "const b=s.getBBox(), v=s.viewBox.baseVal,"
                          "r=s.getBoundingClientRect();"
                          "return [b.width/v.width*r.width, b.height/v.height*r.height]}")
        ink = [round(v / sc, 1) for v in ink]
        off = max(abs(ink[0] - 164.5), abs(ink[1] - 164.5))
        print(f"     QR ink {ink[0]}x{ink[1]} in a 204 box (want 164.5)  "
              f"{'ok' if off <= 2 else 'WRONG SIZE'}")
        bad += off > 2

        # The glyph should be a spread of yellow pixels, not one grey value.
        glyph = pg.evaluate(
            "()=>[...document.querySelectorAll('.slide.active .hb-mark path')]"
            ".map(p=>{const s=getComputedStyle(p);return "
            "{opacity:+s.opacity,fill:s.fill}})")
        ops = [p["opacity"] for p in glyph]
        fills = {p["fill"] for p in glyph}
        spread = max(ops) - min(ops)
        yellow = all(int(c) >= 180 and int(c) > int(b)
                     for fill in fills
                     for c, _, b in [fill.removeprefix("rgb(")
                                     .removesuffix(")").split(",")])
        print(f"     glyph pixels: {len(ops)}  opacity {min(ops):.2f}..{max(ops):.2f} "
              f"spread {spread:.2f}  yellows {len(fills)}  "
              f"{'ok' if spread > .3 and yellow and len(fills) > 1 else 'WRONG'}")
        bad += spread <= .3 or not yellow or len(fills) <= 1
        ctx.close()
    print("mismatches:", bad)


if __name__ == "__main__":
    main()

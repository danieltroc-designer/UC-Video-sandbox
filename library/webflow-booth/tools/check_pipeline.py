"""Measure card 6 against the storyboard frame it was rebuilt from.

Figma numbers are hand-copied from node 184:5610. Also reports whether any cell
overflows, which is the live risk on this card: the panel is the storyboard's
size but the mono inside it is set larger than the storyboard's 13px, and the
UUID row is what runs out of room first.

    python tools/check_pipeline.py
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
    ".shd-t":                 (80, 168, 1760, 64),
    ".shd-s":                 (80, 264, 1760, 23),
    ".pd-shell":              (334, 384, 1252, 554),
    ".pd-grid > :nth-child(1)": (345, 395, 422, 532),
    ".pd-grid > :nth-child(2)": (791, 395, 338, 532),
    ".pd-grid > :nth-child(3)": (1153, 395, 422, 532),
    ".pd-zone":               (427, 480, 258, 333),
    ".pd-pixel":              (910, 476, 100, 130),
    ".pd-stage":              (1249, 465, 230, 297),
    # a centred row, so these are derived rather than copied off the frame
    ".pd-badge:nth-child(2)": (835.0, 989.0, 52.0, 52.0),
    ".pd-badge:nth-child(3)": (933.6, 988.6, 52.9, 52.9),
    ".pd-badge:nth-child(4)": (1032.2, 992.0, 53.7, 46.1),
}
TOL = 2.0


def main():
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE / "pipe"),
            executable_path=str(CHROME) if CHROME.exists() else None,
            headless=True, viewport={"width": 1920, "height": 1080},
            reduced_motion="no-preference", args=["--no-sandbox", "--disable-gpu"])
        pg = ctx.new_page()
        pg.goto(DIST.as_uri())
        pg.wait_for_timeout(1200)
        idx = pg.evaluate("deck.slides.findIndex(s=>s.type==='pipeline')")
        pg.evaluate(f"enter({idx}); playing=false; clearTimeout(timer); clearInterval(tickTimer);")
        # the frame draws the card's established state, before the URL starts
        # growing a row per transform and the right column recentres
        pg.wait_for_timeout(2000)

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
            off = [g - w for g, w in zip(got, want)]
            ok = all(abs(d) <= TOL for d in off)
            bad += not ok
            print(f"{'ok  ' if ok else 'OFF '} {sel:<26} "
                  f"got {got[0]:7.1f},{got[1]:7.1f} {got[2]:6.1f}x{got[3]:5.1f}   "
                  f"d {off[0]:+.1f},{off[1]:+.1f} {off[2]:+.1f},{off[3]:+.1f}")

        # does anything spill out of its cell?
        print()
        for sel, label in ((".pd-url .row", "url rows"), (".pd-analysis p", "analysis")):
            worst = pg.evaluate(
                "s=>{const rows=[...document.querySelectorAll('.slide.active '+s)];"
                "return Math.max(...rows.map(r=>r.getBoundingClientRect().width))}", sel)
            print(f"     widest {label}: {worst/sc:.1f}px")
        room = pg.evaluate(
            "()=>{const c=document.querySelector('.slide.active .pd-grid > :nth-child(3)');"
            "const cs=getComputedStyle(c);"
            "return c.getBoundingClientRect().width - parseFloat(cs.paddingLeft)*2}")
        print(f"     right column has: {room/sc:.1f}px")
        for sel in (".pd-grid > :nth-child(1)", ".pd-grid > :nth-child(3)"):
            spill = pg.evaluate("s=>{const e=document.querySelector('.slide.active '+s);"
                                "return [e.scrollWidth-e.clientWidth, e.scrollHeight-e.clientHeight]}", sel)
            print(f"     overflow {sel}: {spill[0]}w {spill[1]}h")
        ctx.close()
    print("mismatches:", bad)


if __name__ == "__main__":
    main()

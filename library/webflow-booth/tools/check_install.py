"""Measure card 5 against the storyboard frame it was built from.

Figma numbers are hand-copied from node 184:5641; this asserts the built card
lands on them, so a stray padding change shows up as a number rather than as a
screenshot someone has to eyeball.

    python tools/check_install.py
"""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist" / "uploadcare-simple.html"
PROFILE = ROOT / "tools" / "_profile"
CHROME = (pathlib.Path.home()
          / ".cache/ms-playwright-stable/chromium-1223/chrome-mac-arm64"
          / "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")

# selector -> (x, y, w, h) in stage px, from the Figma frame
SPEC = {
    ".shd-t":     (80, 212, 1760, 171),
    ".shd-s":     (80, 415, 1760, 23),
    ".wf-panel":  (706, 591, 508, 244),
    ".wf-tile":   (747, 632, 89, 89),
    ".wf-name":   (860, 632, 313, 12),
    ".wf-meta":   (860, 655, 43, 16),   # hug width, like the frame

    ".wf-desc":   (860, 684, 313, 31),
    ".wf-btnwrap": (860, 747, 111, 47),
}
TOL = 1.5


def main():
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE / "geom"),
            executable_path=str(CHROME) if CHROME.exists() else None,
            headless=True, viewport={"width": 1920, "height": 1080},
            reduced_motion="no-preference", args=["--no-sandbox", "--disable-gpu"])
        pg = ctx.new_page()
        pg.goto(DIST.as_uri())
        pg.wait_for_timeout(1200)
        idx = pg.evaluate("deck.slides.findIndex(s=>s.type==='install')")
        pg.evaluate(f"enter({idx}); playing=false; clearTimeout(timer); clearInterval(tickTimer);")
        pg.wait_for_timeout(1600)                      # everything settled

        stage = pg.evaluate("document.getElementById('stage').getBoundingClientRect().toJSON()")
        scale = stage["width"] / 1920
        bad = 0
        for sel, want in SPEC.items():
            r = pg.evaluate(
                f"document.querySelector('.slide.active {sel}').getBoundingClientRect().toJSON()")
            got = ((r["x"] - stage["x"]) / scale, (r["y"] - stage["y"]) / scale,
                   r["width"] / scale, r["height"] / scale)
            off = [g - w for g, w in zip(got, want)]
            ok = all(abs(d) <= TOL for d in off)
            bad += not ok
            print(f"{'ok  ' if ok else 'OFF '} {sel:<13} "
                  f"got {got[0]:7.1f},{got[1]:7.1f} {got[2]:6.1f}x{got[3]:5.1f}   "
                  f"want {want[0]:>6},{want[1]:>6} {want[2]:>5}x{want[3]:<4}   "
                  f"d {off[0]:+.1f},{off[1]:+.1f} {off[2]:+.1f},{off[3]:+.1f}")

        # the blurb wraps rather than being broken by hand, so print where it
        # actually breaks — the frame breaks it after "plugin"
        print("     blurb lines:", pg.evaluate(
            "()=>{const e=document.querySelector('.slide.active .wf-desc');"
            "const t=e.firstChild,out=[],r=document.createRange();let a=0,prev=null;"
            "for(let i=1;i<=t.length;i++){r.setStart(t,a);r.setEnd(t,i);"
            "const top=r.getClientRects()[r.getClientRects().length-1]?.top;"
            "if(prev!==null&&top!==prev){out.push(t.data.slice(a,i-1).trim());a=i-1}"
            "prev=top}out.push(t.data.slice(a).trim());return out}"))
        # and the button label has to be the width the export measured
        lbl = pg.evaluate(
            "()=>{const e=document.querySelector('.slide.active .wf-lbl[data-s=\"0\"]');"
            "const r=document.createRange();r.selectNodeContents(e);"
            "return r.getBoundingClientRect().width}")
        print(f"     install label: {lbl/scale:.1f}px wide (figma export: 77.0)")
        ctx.close()
    print("mismatches:", bad)


if __name__ == "__main__":
    main()

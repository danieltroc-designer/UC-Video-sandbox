"""Assert a slide's score is fully retired when the deck moves on.

Every card schedules its choreography on the timeline that enter() owns, so
leaving a slide should stop all of it: no typewriter still appending text to a
hidden slide, no WAAPI animations piling up across a loop. This is the check
that the single kill() actually covers both.

    python tools/verify_timeline.py
"""
import pathlib, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist" / "uploadcare-simple.html"
PROFILE = ROOT / "tools" / "_profile" / "tl"
CHROME = (pathlib.Path.home()
          / ".cache/ms-playwright-stable/chromium-1223/chrome-mac-arm64"
          / "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")

fails = []


def check(label, ok, detail=""):
    print(f"  {'ok  ' if ok else 'FAIL'}  {label}{'  ' + detail if detail else ''}")
    if not ok:
        fails.append(label)


with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        user_data_dir=str(PROFILE),
        executable_path=str(CHROME) if CHROME.exists() else None,
        headless=True, viewport={"width": 1920, "height": 1080},
        reduced_motion="no-preference", args=["--no-sandbox", "--disable-gpu"],
    )
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(DIST.as_uri())
    pg.wait_for_timeout(1200)
    pg.evaluate("playing=false; clearTimeout(timer); clearInterval(tickTimer);")

    print("inactive cards retire their CSS choreography")
    pg.evaluate("enter(0)")
    pg.wait_for_timeout(1600)
    before = pg.evaluate("""document.querySelector('.slide.active')
        .getAnimations({subtree:true}).filter(a=>a.playState==='running').length""")
    pg.evaluate("enter(1)")
    pg.wait_for_timeout(900)  # allow the intentional 480ms slide crossfade to retire
    inactive = pg.evaluate("""(() => {
        return [...document.querySelectorAll('.slide:not(.active)')]
          .reduce((n,s)=>n+s.getAnimations({subtree:true})
            .filter(a=>a.playState==='running').length,0);
    })()""")
    check("card 1 animation had started", before > 0, f"{before} running")
    check("no animation keeps running on inactive cards", inactive == 0,
          f"{inactive} running")

    print("animations do not accumulate across a full loop")
    pg.evaluate("enter(0)")
    pg.wait_for_timeout(600)
    base = pg.evaluate("document.getAnimations().length")
    for _ in range(3):                             # three passes over the deck
        for i in range(7):
            pg.evaluate(f"enter({i})")
            pg.wait_for_timeout(120)
    pg.evaluate("enter(0)")
    pg.wait_for_timeout(600)
    end = pg.evaluate("document.getAnimations().length")
    check("running animation count stable", end <= base * 2 + 8, f"{base} -> {end}")

    print("re-entering card 1 replays it from the top")
    pg.evaluate("enter(0)")
    pg.wait_for_timeout(5200)          # the 1.45s upload ring completes at ~4.4s
    late = pg.evaluate("""parseFloat(getComputedStyle(
        document.querySelector('.ef-uaction .di-ring .arc')).strokeDashoffset)""")
    pg.evaluate("enter(1)"); pg.wait_for_timeout(150)
    pg.evaluate("enter(0)"); pg.wait_for_timeout(80)
    early = pg.evaluate("""parseFloat(getComputedStyle(
        document.querySelector('.ef-uaction .di-ring .arc')).strokeDashoffset)""")
    check("upload ring restarts in progress", late < 2 and early > 30,
          f"{late:.1f} -> {early:.1f} dash offset")

    check("no page errors", not errors, "; ".join(errors[:3]))
    ctx.close()

print("\nFAILED: " + ", ".join(fails) if fails else "\nall timeline checks passed")
sys.exit(1 if fails else 0)

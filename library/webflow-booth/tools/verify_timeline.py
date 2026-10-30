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

BOARD = 6   # outro board: types telemetry into four nodes over several seconds

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

    print("typewriter stops when the deck moves on")
    pg.evaluate(f"enter({BOARD})")
    pg.wait_for_timeout(1400)                      # mid-typing
    # leave and sample in one round trip: measuring first would race the
    # typewriter, which can land another character before enter(0) arrives
    mid = pg.evaluate("""(() => {
        enter(0);
        return [...document.querySelectorAll('.hb-meta')].map(e=>e.textContent.length);
    })()""")
    pg.wait_for_timeout(2500)                      # long enough to finish typing
    after = pg.evaluate("[...document.querySelectorAll('.hb-meta')].map(e=>e.textContent.length)")
    check("meta text frozen after leaving", mid == after, f"{sum(mid)} -> {sum(after)} chars")
    check("typing had actually started", sum(mid) > 0, f"{sum(mid)} chars")

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

    print("re-entering a card replays it from the top")
    pg.evaluate(f"enter({BOARD})")
    pg.wait_for_timeout(2500)
    first = pg.evaluate("[...document.querySelectorAll('.hb-meta')].map(e=>e.textContent.length)")
    pg.evaluate("enter(0)"); pg.wait_for_timeout(200)
    pg.evaluate(f"enter({BOARD})"); pg.wait_for_timeout(300)
    early = pg.evaluate("[...document.querySelectorAll('.hb-meta')].map(e=>e.textContent.length)")
    check("meta restarts empty-ish on re-entry", sum(early) < sum(first),
          f"{sum(first)} -> {sum(early)} chars")

    check("no page errors", not errors, "; ".join(errors[:3]))
    ctx.close()

print("\nFAILED: " + ", ".join(fails) if fails else "\nall timeline checks passed")
sys.exit(1 if fails else 0)

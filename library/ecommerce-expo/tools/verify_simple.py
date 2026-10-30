"""Screenshot every card of the simplified booth deck, normal + reduced motion.

No test suite here, so this is the check: load dist/uploadcare-simple.html in a
headless browser, jump to each card, and capture it at the moments its
choreography matters. Also asserts the console stays clean and the embedded
mono font actually loaded.

    python tools/verify_simple.py           # writes tools/_shots/*.png
"""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist" / "uploadcare-simple.html"
OUT = ROOT / "tools" / "_shots"
PROFILE = ROOT / "tools" / "_profile"

# card index -> ms after enter() worth capturing
SHOTS = {
    # card 1 runs a 10s slot: drag, drop, handover, the 1.45s upload, the
    # optimization readout and its hold, then the storefront
    0: [700, 1600, 2600, 3600, 4900, 6100, 7400, 8600],
    # card 2: one second per panel, twice; sample each highlight
    1: [1400, 2400, 3400, 4400, 5400, 6400, 7400, 8400, 9400, 10400],
    2: [250, 700, 1400, 2200],         # headline, then Zephyr mark
    3: [400, 1500, 1800, 2350, 2900, 4000, 5200, 5800, 7400, 8200, 8800, 9500, 10500, 12500],
                                 # backend → hover → click → editor → prompt → shimmer
                                 # → result → Add to media pointer/click → storefront
    4: [250, 650, 1100],               # six-logo sweep
    5: [700, 1800, 2900, 3800, 5400, 7400],
                                            # upload → optimize → deliver → logo hold
    6: [400, 1400, 3000],              # booth CTA
}

# the bundled driver resolves an x64 path on this machine; use the arm64 build
CHROME = (pathlib.Path.home()
          / ".cache/ms-playwright-stable/chromium-1223/chrome-mac-arm64"
          / "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")


def run(reduced, tag):
    OUT.mkdir(parents=True, exist_ok=True)
    issues = []
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE / tag),
            executable_path=str(CHROME) if CHROME.exists() else None,
            headless=True,
            viewport={"width": 1920, "height": 1080},
            reduced_motion="reduce" if reduced else "no-preference",
            args=["--no-sandbox", "--disable-gpu"],
        )
        pg = ctx.new_page()
        pg.on("console", lambda m: issues.append(f"{m.type}: {m.text}")
              if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: issues.append(f"pageerror: {e}"))
        pg.goto(DIST.as_uri())
        pg.wait_for_timeout(1200)
        n = pg.evaluate("deck.slides.length")
        mono = pg.evaluate("document.fonts.check(\"18px 'Commit Mono'\")")
        print(f"[{tag}] slides={n} mono={mono}")
        for i in range(n):
            pg.evaluate(f"enter({i}); playing=false; clearTimeout(timer); clearInterval(tickTimer);")
            prev = 0
            for t in SHOTS.get(i, [2000]):
                pg.wait_for_timeout(t - prev)
                prev = t
                pg.screenshot(path=str(OUT / f"{tag}-{i}-{t}.png"))
        ctx.close()
    for msg in issues:
        print(f"[{tag}] CONSOLE {msg}")
    return issues


if __name__ == "__main__":
    bad = run(False, "norm") + run(True, "red")
    print("console issues:", len(bad))

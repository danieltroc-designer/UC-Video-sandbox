"""Trace card 5's pointer frame by frame: opacity and position over time.

Sampling from inside the page rather than off screenshots, because a screenshot
per frame is slow enough to distort what you think you are measuring.

    python tools/trace_cursor.py
"""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist" / "uploadcare-simple.html"
PROFILE = ROOT / "tools" / "_profile"
CHROME = (pathlib.Path.home()
          / ".cache/ms-playwright-stable/chromium-1223/chrome-mac-arm64"
          / "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")

SAMPLE = """() => new Promise(resolve => {
  enter(IDX); playing = false; clearTimeout(timer); clearInterval(tickTimer);
  const t0 = performance.now();
  const c = document.querySelector('.slide.active .wf-cursor');
  const b = document.querySelector('.slide.active .wf-btn');
  const out = [];
  (function tick(){
    const t = performance.now() - t0, cs = getComputedStyle(c);
    const m = /matrix\\(1, 0, 0, 1, ([-\\d.]+), ([-\\d.]+)\\)/.exec(cs.transform);
    out.push([Math.round(t), Math.round(cs.opacity * 100) / 100,
              m ? Math.round(+m[1]) : null, m ? Math.round(+m[2]) : null,
              b.dataset.state]);
    if (t < 4200) requestAnimationFrame(tick); else resolve(out);
  })();
})"""


def main():
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE / "trace"),
            executable_path=str(CHROME) if CHROME.exists() else None,
            headless=True, viewport={"width": 1920, "height": 1080},
            reduced_motion="no-preference", args=["--no-sandbox", "--disable-gpu"])
        pg = ctx.new_page()
        pg.goto(DIST.as_uri())
        pg.wait_for_timeout(1000)
        idx = pg.evaluate("deck.slides.findIndex(s=>s.type==='install')")
        rows = pg.evaluate(SAMPLE.replace("IDX", str(idx)))
        ctx.close()

    x0, y0 = rows[0][2], rows[0][3]
    xn, yn = rows[-1][2], rows[-1][3]
    span = max(1, abs(xn - x0))
    last = -999
    for t, op, x, y, state in rows:
        if t - last < 100:
            continue
        last = t
        pct = 0 if x is None else round((x0 - x) / span * 100)
        bar = "#" * round(pct / 4)
        print(f"{t:5}ms  op {op:<4} {x},{y}  state {state}  {pct:3}% {bar}")


if __name__ == "__main__":
    main()

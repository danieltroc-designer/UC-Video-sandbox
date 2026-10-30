"""Record the whole booth loop as 4K frames, then encode an MP4.

The deck is a live DOM animation, so the only honest way to get a video of it
is to play it once and capture what the browser actually paints.

**The viewport is the full 3840x2160 and `deviceScaleFactor` stays 1.**
`Page.startScreencast` captures the visual viewport in CSS pixels and ignores
the device scale factor entirely, so a 1920x1080 viewport at `dsf=2` — which
screenshots correctly at 4K and looks like the obvious setup — delivers
1920x1080 frames that then get upscaled into a 4K container. That shipped
once, and it reads exactly like a bad encode: noisy, haloed edges. At a 4K
viewport `fit()` scales #stage by 2, which is also what a real 4K panel does,
and the result is pixel-identical to the `dsf=2` screenshot (verified: mean
abs error 0.000) — Chrome re-rasterises through the transform rather than
upscaling. `check_size()` now asserts the delivered frames are the size the
encoder is told to expect, so this cannot fail silently again.

Frames are PNG, not JPEG: at 4K the screencast still sustains ~67fps, which
is well past the 30fps output, and it keeps the intermediate lossless so the
only generation loss in the whole pipeline is the H.264 encode.

Screencast only emits a frame when something changed, so the timestamps are
irregular by design. They are kept per frame and the encoder resamples them
to a constant 30fps, which turns a still hold into held frames rather than
into drift.

    python tools/export_video.py                       # dist/uploadcare-expo-4k.mp4
    python tools/export_video.py --hide-progress       # drop the progress hairline
    python tools/export_video.py --fps 60 --keep-frames

Requires the arm64 Chrome for Testing that the other tools use, and swiftc
for the encoder (tools/mp4writer.swift) — Playwright's bundled ffmpeg is a
VP8/WebM-only build and cannot write MP4.
"""
import argparse
import base64
import json
import pathlib
import shutil
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist" / "uploadcare-simple.html"
FRAMES = ROOT / "tools" / "_frames"
PROFILE = ROOT / "tools" / "_profile" / "video"
SWIFT = ROOT / "tools" / "mp4writer.swift"
BIN = ROOT / "tools" / "_bin" / "mp4writer"
CHROME = (pathlib.Path.home()
          / ".cache/ms-playwright-stable/chromium-1223/chrome-mac-arm64"
          / "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")

# Dev chrome is not part of the deck. `wake()` runs on boot, so the gear and
# the shortcut hint are visible for the first 3.5s of any fresh load.
HIDE_CSS = """
  #gear, #hint, #editor, #io { display: none !important; }
  * { cursor: none !important; }
"""
HIDE_PROGRESS_CSS = "#progress { display: none !important; }"


def check_size(path, width, height):
    """Fail if the frames are not the resolution the encoder will assume.

    The encoder draws each frame into the output rect, so an undersized frame
    is silently upscaled and the export looks like a bad encode rather than
    like a misconfigured capture. Screencast ignores deviceScaleFactor, which
    is the one way this goes wrong, so it is worth one assertion.
    """
    from PIL import Image
    got = Image.open(path).size
    if got != (width, height):
        sys.exit(f"screencast delivered {got[0]}x{got[1]}, expected "
                 f"{width}x{height} — capture is not running at render scale")
    print(f"[capture] frames are {got[0]}x{got[1]}")


def capture(scale, fmt, quality, hide_progress):
    width, height = 1920 * scale, 1080 * scale
    ext = "png" if fmt == "png" else "jpg"
    FRAMES.mkdir(parents=True, exist_ok=True)
    for old in FRAMES.glob("f*.*"):
        old.unlink()

    issues, frames = [], []
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE),
            executable_path=str(CHROME) if CHROME.exists() else None,
            headless=True,
            # the whole render resolution, not a scaled-up 1920x1080 — see
            # the module docstring
            viewport={"width": width, "height": height},
            device_scale_factor=1,
            reduced_motion="no-preference",
            args=["--no-sandbox", "--hide-scrollbars",
                  "--autoplay-policy=no-user-gesture-required"],
        )
        pg = ctx.new_page()
        pg.on("console", lambda m: issues.append(f"{m.type}: {m.text}")
              if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: issues.append(f"pageerror: {e}"))
        pg.goto(DIST.as_uri())
        pg.wait_for_timeout(1500)

        pg.add_style_tag(content=HIDE_CSS + (HIDE_PROGRESS_CSS if hide_progress else ""))
        pg.evaluate("document.body.classList.remove('ui-awake')")
        mono = pg.evaluate("document.fonts.check(\"18px 'Commit Mono'\")")
        total = pg.evaluate(
            "deck.slides.reduce((n,s)=>n+(s.duration||deck.settings.duration),0)")
        count = pg.evaluate("deck.slides.length")
        print(f"[deck] {count} slides, {total}s loop, mono={mono}")

        client = ctx.new_cdp_session(pg)
        n = [0]

        def on_frame(params):
            try:
                client.send("Page.screencastFrameAck",
                            {"sessionId": params["sessionId"]})
            except Exception:       # a frame can land after the context closes
                return
            n[0] += 1
            path = FRAMES / f"f{n[0]:06d}.{ext}"
            path.write_bytes(base64.b64decode(params["data"]))
            frames.append((params["metadata"]["timestamp"], path.name))

        client.on("Page.screencastFrame", on_frame)

        # Record a loop the deck advanced into by itself. Forcing card 1 to
        # restart mid-score instead leaves its storefront payoff empty — the
        # card resets synchronously on entry but the run it interrupts has
        # already been killed, so the page opens onto nothing. Every card in
        # the recorded window is therefore entered by the deck's own advance
        # timer, exactly as the TV does it.
        pg.evaluate("""() => {
            window.__marks = [];
            const orig = window.enter, n = deck.slides.length;
            window.enter = function(i){
                window.__marks.push({
                    i: ((i % n) + n) % n,
                    t: (performance.timeOrigin + performance.now()) / 1000,
                });
                return orig.apply(this, arguments);
            };
        }""")

        # Jump to the last card first so the pre-roll is one slide, not a
        # whole loop. It is the only card entered out of band and it sits
        # outside the recorded window; the card 7 in the video is the one the
        # deck reaches on its own at the end.
        pg.evaluate(f"enter({count - 1})")
        opts = {"format": fmt, "maxWidth": width, "maxHeight": height,
                "everyNthFrame": 1}
        if fmt != "png":
            opts["quality"] = quality
        client.send("Page.startScreencast", opts)
        started = time.time()

        while not frames:
            if time.time() - started > 10:
                sys.exit("no screencast frames arrived")
            pg.wait_for_timeout(50)
        check_size(FRAMES / frames[0][1], width, height)

        t0 = None
        while t0 is None:
            if time.time() - started > total + 30:
                sys.exit("deck never advanced back to card 1")
            for m in pg.evaluate("window.__marks"):
                if m["i"] == 0 and m["t"] > started:
                    t0 = m["t"]
                    break
            pg.wait_for_timeout(50)
        print(f"[capture] loop starts at card 1 after {t0 - started:.1f}s of pre-roll")

        deadline = t0 + total
        while time.time() < deadline:
            pg.wait_for_timeout(120)
        client.send("Page.stopScreencast")
        pg.wait_for_timeout(150)
        order = pg.evaluate("window.__marks.map(m=>m.i)")
        ctx.close()

    kept = []
    for ts, name in sorted(frames):
        if t0 <= ts < deadline:
            kept.append((ts - t0, name))
        else:
            (FRAMES / name).unlink(missing_ok=True)
    if not kept:
        sys.exit("no frames captured")
    print(f"[capture] card order {order}")

    span = kept[-1][0] - kept[0][0]
    print(f"[capture] {len(kept)} frames over {span:.2f}s "
          f"({len(kept)/max(span,1e-9):.1f} fps avg), {len(issues)} console issues")
    for i in issues[:5]:
        print("  ", i)
    return kept, total


def encode(kept, total, scale, fps, mbps, out):
    manifest = FRAMES / "manifest.json"
    manifest.write_text(json.dumps({
        "dir": str(FRAMES),
        "width": 1920 * scale,
        "height": 1080 * scale,
        "fps": fps,
        "mbps": mbps,
        "duration": total,
        "out": str(out),
        "frames": [{"file": name, "t": round(t, 6)} for t, name in kept],
    }))

    if not BIN.exists() or BIN.stat().st_mtime < SWIFT.stat().st_mtime:
        print("[encode] compiling mp4writer")
        BIN.parent.mkdir(parents=True, exist_ok=True)
        build(BIN)
    subprocess.run([str(BIN), str(manifest)], check=True)


def build(binary):
    """Compile the encoder, working around a toolchain newer than no SDK here.

    The installed swiftc is older than the default SDK's stdlib interface, so
    the plain invocation fails to build module 'Swift'. Falling back through
    the older SDKs that ship alongside it is enough; clang/AVFoundation itself
    is version-agnostic here.
    """
    sdks = sorted(pathlib.Path("/Library/Developer/CommandLineTools/SDKs").glob("MacOSX*.sdk"),
                  reverse=True)
    attempts = [["swiftc", "-O", str(SWIFT), "-o", str(binary)]]
    attempts += [["swiftc", "-O", "-sdk", str(s), str(SWIFT), "-o", str(binary)]
                 for s in sdks]
    errors = []
    for cmd in attempts:
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0 and binary.exists():
            if len(cmd) > 5:
                print(f"[encode] built against {cmd[3]}")
            return
        errors.append((cmd[3] if len(cmd) > 5 else "default sdk",
                       (r.stderr or "").strip().splitlines()[-1:] or ["?"]))
    for sdk, tail in errors:
        print(f"  {sdk}: {tail[0]}", file=sys.stderr)
    sys.exit("could not compile tools/mp4writer.swift")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--scale", type=int, default=2,
                    help="render scale: 2 is a 3840x2160 viewport")
    ap.add_argument("--format", choices=("png", "jpeg"), default="png",
                    help="frame format; png keeps the intermediate lossless")
    ap.add_argument("--quality", type=int, default=95, help="JPEG quality if --format jpeg")
    ap.add_argument("--mbps", type=int, default=60, help="H.264 target bitrate")
    ap.add_argument("--hide-progress", action="store_true")
    ap.add_argument("--keep-frames", action="store_true")
    ap.add_argument("--out", default=str(ROOT / "dist" / "uploadcare-expo-4k.mp4"))
    a = ap.parse_args()

    if not DIST.exists():
        sys.exit(f"missing {DIST} — run python build_simple.py first")

    kept, total = capture(a.scale, a.format, a.quality, a.hide_progress)
    encode(kept, total, a.scale, a.fps, a.mbps, pathlib.Path(a.out))

    if not a.keep_frames:
        shutil.rmtree(FRAMES, ignore_errors=True)
    size = pathlib.Path(a.out).stat().st_size / 1e6
    print(f"[done] {a.out}  ({size:.1f} MB)")


if __name__ == "__main__":
    main()

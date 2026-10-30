#!/usr/bin/env python3
"""Card 1's Figma geometry, storefront handoff, and loop-sensitive reset.

Frame 234:979 is one 1252x554 process shell: the Webflow uploader runs in its
left cell, then its compact progress row and the simplified right-hand analysis
settle together. Frame 234:1415 then opens a 1252x814 browser containing the
same source at its 561x590 product slot. Checking a second visit proves the
completed inline state is synchronously reset before the new score plays.
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
DECK = ROOT / "dist" / "uploadcare-simple.html"
PROFILE = ROOT / "tools" / "_profile" / "cf"
# the bundled driver resolves an x64 path on this machine; use the arm64 build
CHROME = (pathlib.Path.home()
          / ".cache/ms-playwright-stable/chromium-1223/chrome-mac-arm64"
          / "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")
CARD = 0                                            # commerceFlow


def read(pg):
    return pg.evaluate("""() => {
      const root = document.querySelector('.slide.active .ef-wrap');
      const process = root && root.querySelector('.ef-process');
      const site = root && root.querySelector('.ef-site');
      const sitePhoto = root && root.querySelector('.ef-site-photo');
      const drag = root && root.querySelector('.ef-drag');
      const widget = root && root.querySelector('.ef-widget');
      const panel = root && root.querySelector('.ef-panel');
      const arc = root && root.querySelector('.ef-uaction .di-ring .arc');
      const result = root && root.querySelector('.ef-analyse-img');
      const lines = root ? [...root.querySelectorAll('.ef-analysis p')] : [];
      const images = root ? [...root.querySelectorAll('img')] : [];
      return {
        shell: process ? [process.offsetLeft, process.offsetTop,
                          process.offsetWidth, process.offsetHeight] : null,
        shellOpacity: process ? parseFloat(getComputedStyle(process).opacity) : null,
        site: site ? [site.offsetLeft, site.offsetTop,
                      site.offsetWidth, site.offsetHeight] : null,
        siteOpacity: site ? parseFloat(getComputedStyle(site).opacity) : null,
        sitePhoto: sitePhoto ? [sitePhoto.offsetLeft, sitePhoto.offsetTop,
                                sitePhoto.offsetWidth, sitePhoto.offsetHeight] : null,
        dragOpacity: drag ? parseFloat(getComputedStyle(drag).opacity) : null,
        widgetOpacity: widget ? parseFloat(getComputedStyle(widget).opacity) : null,
        panelOpacity: panel ? parseFloat(getComputedStyle(panel).opacity) : null,
        dash: arc ? parseFloat(getComputedStyle(arc).strokeDashoffset) : null,
        resultOpacity: result ? parseFloat(getComputedStyle(result).opacity) : null,
        lineOpacity: lines.map(x=>parseFloat(getComputedStyle(x).opacity)),
        imageSources: [...new Set(images.map(x=>x.src))],
        imageCount: images.length,
        state: process ? process.dataset.state || '' : null,
      };
    }""")


def main():
    fails = []

    def check(label, ok, detail):
        print(f"  {'ok  ' if ok else 'FAIL'}  {label}  {detail}")
        if not ok:
            fails.append(label)

    with sync_playwright() as p:
        b = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE),
            executable_path=str(CHROME) if CHROME.exists() else None,
            viewport={"width": 1440, "height": 900},
            reduced_motion="no-preference",
        )
        pg = b.new_page()
        pg.goto(DECK.as_uri())
        pg.wait_for_timeout(600)

        for visit in (1, 2):
            print(f"visit {visit}")
            # arrive from elsewhere, the way the loop does. Calling enter() on the
            # card that is already live never toggles `.active`, so the CSS
            # choreography carries on from wherever the page load left it.
            pg.evaluate("enter(3)")
            pg.wait_for_timeout(700)
            pg.evaluate(f"enter({CARD})")
            pg.wait_for_timeout(250)
            early = read(pg)
            check("process shell matches frame",
                  early["shell"] == [334, 354, 1252, 554], str(early["shell"]))
            check("one photo source feeds every view",
                  len(early["imageSources"]) == 1 and early["imageCount"] == 5,
                  f"{len(early['imageSources'])} source / {early['imageCount']} views")
            check("uploader opens before result",
                  early["widgetOpacity"] > .98 and early["resultOpacity"] < .02,
                  f"widget {early['widgetOpacity']:.2f}, result {early['resultOpacity']:.2f}")
            check("upload ring resets empty", early["dash"] > 57,
                  f"dash {early['dash']:.1f}")

            # the storefront settles at ~8.1s on the booth-paced score
            pg.wait_for_timeout(8600)
            late = read(pg)
            check("compact upload panel completes",
                  late["panelOpacity"] > .98 and late["dash"] < 1,
                  f"panel {late['panelOpacity']:.2f}, dash {late['dash']:.1f}")
            check("analysis result resolves",
                  late["resultOpacity"] > .98 and min(late["lineOpacity"]) > .98,
                  f"photo {late['resultOpacity']:.2f}, lines {late['lineOpacity']}")
            check("storefront browser matches frame",
                  late["site"] == [334, 386, 1252, 814]
                  and late["sitePhoto"] == [33, 62, 561, 590],
                  f"browser {late['site']}, photo {late['sitePhoto']}")
            check("storefront replaces process shell",
                  late["state"] == "site-live"
                  and late["shellOpacity"] < .02 and late["siteOpacity"] > .98,
                  f"{late['state']}, shell {late['shellOpacity']:.2f}, site {late['siteOpacity']:.2f}")

        b.close()

    print()
    if fails:
        print(f"{len(fails)} check(s) failed")
        sys.exit(1)
    print("card 1 replays clean on every loop")


if __name__ == "__main__":
    main()

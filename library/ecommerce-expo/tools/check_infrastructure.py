#!/usr/bin/env python3
"""Assert Ecommerce card 6 against Figma frame 218:1470 and its three beats."""

import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist" / "uploadcare-simple.html"
PROFILE = ROOT / "tools" / "_profile"
CARD = 5

CHROME = next(
    (p for root in (pathlib.Path.home() / ".cache/ms-playwright-stable",
                    pathlib.Path.home() / "Library/Caches/ms-playwright")
     for p in sorted(root.glob("chromium-*/chrome-mac-arm64/*.app/Contents/MacOS/*"),
                     reverse=True)
     if p.is_file()), None)

fails = []


def check(label, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{'  ' + detail if detail else ''}")
    if not ok:
        fails.append(label)


def state(pg):
    return pg.evaluate("""()=>{
      const q=s=>document.querySelector('.slide.active '+s);
      const file=q('.ei-file'), card=q('.ei-card'), photo=q('.ei-photo');
      const matrix=e=>new DOMMatrixReadOnly(getComputedStyle(e).transform);
      const m=matrix(file), cm=matrix(card), pm=matrix(photo), rail=q('.ei-rail');
      return {
        rail:[rail.offsetLeft,rail.offsetTop,rail.offsetWidth,rail.offsetHeight],
        railOpacity:getComputedStyle(rail).opacity,
        railPhase:rail.dataset.phase,
        railFill:getComputedStyle(q('.ei-collapsed path')).fill,
        stepBorder:getComputedStyle(q('.ei-step')).borderTopColor,
        fileBase:[file.offsetLeft,file.offsetTop,file.offsetWidth,file.offsetHeight],
        fileOpacity:getComputedStyle(file).opacity,
        fileTransform:[m.e,m.f],
        card:[card.offsetWidth,card.offsetHeight,cm.a],
        photoTransform:[pm.a,pm.e,pm.f],
        size:q('.ei-size').textContent,
        steps:[...document.querySelectorAll('.slide.active .ei-step')].map(e=>e.dataset.state),
        centres:[...document.querySelectorAll('.slide.active .ei-step')].map(
          e=>rail.offsetLeft+e.offsetLeft+e.offsetWidth/2+matrix(e).e),
        // the rail contracts by translating its steps, so its own box never
        // moves: measure the frame the steps actually draw
        extent:(()=>{const s=[...document.querySelectorAll('.slide.active .ei-step')];
          const a=s[0], z=s[s.length-1];
          const l=rail.offsetLeft+a.offsetLeft+matrix(a).e;
          return [l, rail.offsetLeft+z.offsetLeft+z.offsetWidth+matrix(z).e-l]})(),
        lockup:(()=>{const e=q('.ei-lockup');return [
          e.offsetLeft,e.offsetTop,e.offsetWidth,e.offsetHeight,
          getComputedStyle(e).opacity,matrix(e).a]})()
      };
    }""")


def main():
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(PROFILE), headless=True,
            executable_path=str(CHROME) if CHROME else None,
            viewport={"width": 1920, "height": 1080},
            reduced_motion="no-preference", device_scale_factor=1)
        pg = ctx.pages[0] if ctx.pages else ctx.new_page()
        errors = []
        pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
        pg.goto(DIST.as_uri())
        pg.wait_for_timeout(600)
        pg.evaluate("enter(0)")
        pg.wait_for_timeout(100)
        pg.evaluate(f"enter({CARD})")

        opening = state(pg)
        print("\nframe geometry")
        check("rail is Figma's 989px row",
              opening["rail"] == [466, 701, 989, 49], str(opening["rail"]))
        check("file starts in Figma's 120x150 box",
              opening["fileBase"] == [602, 529, 120, 150],
              str(opening["fileBase"]))

        pg.wait_for_timeout(1800)
        optimized = state(pg)
        print("\noptimize beat")
        check("Optimize is active",
              optimized["steps"] == ["done", "active", "idle"],
              str(optimized["steps"]))
        current_kb = int(optimized["size"].removesuffix("KB"))
        check("weight is visibly counting down",
              118 < current_kb < 680, optimized["size"])
        check("file stays 120x150 at Optimize",
              optimized["card"] == [120, 150, 1],
              str(optimized["card"]))
        opt_centre = opening["fileBase"][0] + opening["fileBase"][2]/2 + optimized["fileTransform"][0]
        check("file lands over Optimize",
              abs(opt_centre - optimized["centres"][1]) <= 1,
              f"{opt_centre:.1f} vs {optimized['centres'][1]:.1f}")

        pg.wait_for_timeout(550)
        settled_weight = state(pg)["size"]
        check("weight settles at 118KB", settled_weight == "118KB", settled_weight)

        pg.wait_for_timeout(900)
        delivered = state(pg)
        print("\ndeliver beat")
        check("Deliver is active",
              delivered["steps"] == ["done", "done", "active"],
              str(delivered["steps"]))
        deliver_centre = opening["fileBase"][0] + opening["fileBase"][2]/2 + delivered["fileTransform"][0]
        check("file lands over Deliver",
              abs(deliver_centre - delivered["centres"][2]) <= 1,
              f"{deliver_centre:.1f} vs {delivered['centres'][2]:.1f}")
        check("crop waits until travel has stopped",
              delivered["photoTransform"] == [1, 0, 0],
              str(delivered["photoTransform"]))

        pg.wait_for_timeout(600)
        cropped = state(pg)
        scale, tx, ty = cropped["photoTransform"]
        print("\ncrop beat")
        check("file is still 120x150 during crop",
              cropped["card"] == [120, 150, 1], str(cropped["card"]))
        check("delivery crop settled",
              abs(scale-.847)<.01 and abs(tx-10.84)<.2 and abs(ty+5)<.2,
              f"scale {scale:.3f}, translate ({tx:.2f},{ty:.2f})")

        pg.wait_for_timeout(1050)
        compact = state(pg)
        print("\ncollapse beat")
        check("file disappears after delivery",
              compact["fileOpacity"] == "0", compact["fileOpacity"])
        check("rail collapses to frame 219:1578",
              abs(compact["extent"][0] - 722.5) < 1.5
              and abs(compact["extent"][1] - 475) < 1.5
              and compact["railPhase"] == "collapse",
              f"{[round(v, 1) for v in compact['extent']]}, {compact['railPhase']}")
        check("the contraction never reflows the rail",
              compact["rail"] == [466, 701, 989, 49], str(compact["rail"]))
        # the border is sampled while its .75s transition is still resolving,
        # so compare warmth rather than an exact triplet
        border = [int(v) for v in compact["stepBorder"]
                  .removeprefix("rgb(").removesuffix(")").split(",")]
        check("compact path resolves to yellow",
              compact["railFill"] == "rgb(255, 207, 62)"
              and all(abs(g - w) <= 4 for g, w in zip(border, (255, 231, 160))),
              f"{compact['railFill']}, {compact['stepBorder']}")

        pg.wait_for_timeout(550)
        final = state(pg)
        print("\nlogo beat")
        check("rail hands over completely", final["railOpacity"] == "0",
              final["railOpacity"])
        check("lockup matches frame 219:1612",
              final["lockup"][:4] == [791, 693, 339, 61]
              and final["lockup"][4] == "1"
              and abs(final["lockup"][5]-1)<.01,
              str(final["lockup"]))
        check("console clean", not errors, "; ".join(errors[:3]))
        ctx.close()

    print("\n" + ("all checks passed" if not fails
                   else f"{len(fails)} FAILED: " + ", ".join(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())

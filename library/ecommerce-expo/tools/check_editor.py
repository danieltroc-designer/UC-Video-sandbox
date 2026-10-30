#!/usr/bin/env python3
"""Card 4: verify backend -> Edit with AI -> result -> storefront.

The slide records the production ai-catalog-admin interaction offline. This
check protects the sequence, the exact preset prompt, source/result
provenance, replay reset and reduced-motion payoff.

Two properties here are easy to lose in a refactor and are asserted directly:
the backend is live DOM rather than a screenshot of one, and the card never
zooms — the page it works in holds still while only the pointer moves.
"""

import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
DECK = ROOT / "dist" / "uploadcare-simple.html"
CHROME = next(
    (p for root in (pathlib.Path.home() / ".cache/ms-playwright-stable",
                    pathlib.Path.home() / "Library/Caches/ms-playwright")
     for p in sorted(root.glob("chromium-*/chrome-mac-arm64/*.app/Contents/MacOS/*"),
                     reverse=True)
     if p.is_file()), None)

CARD = 3
PROMPT = ("Replace the background with a flat sage green studio backdrop, "
          "keep the bottle and its natural shadow")
fails = []


def check(label, ok, detail=""):
    print(f"  {'ok  ' if ok else 'FAIL'}  {label}{'  ' + detail if detail else ''}")
    if not ok:
        fails.append(label)


def read(pg):
    return pg.evaluate("""() => {
      const root = document.querySelector('.slide.active .ce-wrap');
      const q = s => root && root.querySelector(s);
      const opacity = e => e ? parseFloat(getComputedStyle(e).opacity) : null;
      const natural = e => e ? [e.naturalWidth, e.naturalHeight] : null;
      const rect = e => { if (!e) return null; const r = e.getBoundingClientRect();
                          return [r.left, r.top, r.width, r.height]; };
      const stage = q('.ce-stage');
      return {
        stage: stage ? [stage.offsetLeft, stage.offsetTop,
                        stage.offsetWidth, stage.offsetHeight] : null,
        backend: opacity(q('.ce-backend')),
        cursor: opacity(q('.ce-admin-cursor')),
        ring: opacity(q('.ce-click-ring')),
        cursorBox: rect(q('.ce-admin-cursor'))?.slice(2) || null,
        doneRing: opacity(q('.ce-done-ring')),
        doneBox: rect(q('.ce-done')),
        hot: !!q('.ce-shot')?.classList.contains('hot'),
        edit: opacity(q('.ce-edit')),
        shot: rect(q('.ce-shot')),
        tip: rect(q('.ce-admin-cursor'))?.slice(0, 2) || null,
        // .ce-page, not .ce-backend: the pointer itself is an inlined SVG img
        backendImages: [...(q('.ce-page')?.querySelectorAll('img') || [])]
                         .map(i => [i.naturalWidth, i.naturalHeight]),
        crumb: q('.ce-crumb-now')?.textContent || '',
        action: q('.ce-edit')?.textContent.trim() || '',
        editor: opacity(q('.ce-editor')),
        prompt: q('.ce-prompt span')?.textContent || '',
        after: opacity(q('.ce-after')),
        veil: opacity(q('.ce-veil')),
        shimmer: opacity(q('.ce-shimmer')),
        done: q('.ce-done') ? getComputedStyle(q('.ce-done')).backgroundColor : '',
        site: opacity(q('.ce-site')),
        siteBox: q('.ce-site') ? [q('.ce-site').offsetLeft, q('.ce-site').offsetTop,
                                  q('.ce-site').offsetWidth, q('.ce-site').offsetHeight] : null,
        sitePhoto: opacity(q('.ce-site .ef-site-photo')),
        sitePhotoNatural: natural(q('.ce-site .ef-site-photo img')),
        siteTitle: q('.ce-site .ef-site-title')?.textContent || '',
        sourceNatural: natural(q('.ce-before')),
        afterNatural: natural(q('.ce-after')),
      };
    }""")


def enter(pg):
    pg.evaluate("enter(0)")
    pg.wait_for_timeout(200)
    pg.evaluate(f"enter({CARD}); playing=false; clearTimeout(timer); clearInterval(tickTimer)")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=str(CHROME) if CHROME else None,
            headless=True, args=["--no-sandbox", "--disable-gpu"])
        pg = browser.new_page(
            viewport={"width": 1920, "height": 1080},
            reduced_motion="no-preference")
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(DECK.as_uri())
        pg.wait_for_timeout(800)

        for visit in (1, 2):
            print(f"visit {visit}")
            enter(pg)
            pg.wait_for_timeout(250)
            early = read(pg)
            check("editor stage matches composition",
                  early["stage"] == [334, 360, 1252, 640], str(early["stage"]))
            check("product backend opens before editor",
                  early["backend"] > .98 and early["editor"] < .02,
                  f"backend {early['backend']:.2f}, editor {early['editor']:.2f}")
            check("prompt resets empty", early["prompt"] == "", repr(early["prompt"]))
            # live DOM, not a capture: the only bitmaps in the backend are the
            # production source photo, in the Media slot and the preview card
            check("backend is rebuilt UI, not a screenshot",
                  early["backendImages"] == [[1536, 2048], [1536, 2048]]
                  and early["crumb"] == "Resurfacing Body Lotion"
                  and early["action"] == "Edit with AI",
                  f"{early['backendImages']}, {early['crumb']!r}")
            check("Edit with AI waits for the pointer",
                  not early["hot"] and early["edit"] < .02,
                  f"hot {early['hot']}, pill {early['edit']:.2f}")
            check("catalog source is the production original",
                  early["sourceNatural"] == [1536, 2048],
                  str(early["sourceNatural"]))

            # 125ms, not 250: the click ripple is only readable for ~230ms, and
            # a cadence longer than the shortest beat turns this into a coin toss
            samples = []
            for _ in range(84):
                pg.wait_for_timeout(125)
                samples.append(read(pg))

            # the pointer crosses the image, and the pill is a consequence of
            # that crossing rather than something that was always on the page
            inside = [s for s in samples
                      if s["cursor"] > .8 and s["tip"] and s["shot"]
                      and s["shot"][0] <= s["tip"][0] <= s["shot"][0] + s["shot"][2]
                      and s["shot"][1] <= s["tip"][1] <= s["shot"][1] + s["shot"][3]]
            check("pointer crosses the catalogue image",
                  bool(inside), f"{len(inside)} sample(s) with the tip in the slot")
            check("hover reveals Edit with AI under it",
                  any(s["hot"] and s["edit"] > .95 for s in inside),
                  "observed" if inside else "not observed")
            check("pointer commits to the action",
                  any(s["ring"] > .1 for s in samples), "click ring observed")

        # the user-visible contract of this card: the backend does not zoom.
        # Only while it is actually up — the .985 it recedes to as the editor
        # takes over is the handover, and sampling mid-crossfade would read
        # that as a camera move.
            held = [s["shot"] for s in samples if s["backend"] > .99 and s["shot"]]
            drift = max((max(abs(r[i] - held[0][i]) for i in range(4))
                         for r in held), default=0)
            check("the backend never zooms", drift < .6, f"{drift:.2f}px drift")

            editor_state = next((s for s in samples
                                 if s["editor"] > .98 and s["backend"] < .02), None)
            check("editor modal replaces backend",
                  editor_state is not None,
                  "observed" if editor_state else "not observed")
            typing = next((s for s in samples
                           if 10 < len(s["prompt"]) < len(PROMPT)
                           and PROMPT.startswith(s["prompt"])), None)
            check("exact preset prompt types in place",
                  typing is not None,
                  (f"{len(typing['prompt'])}/{len(PROMPT)} chars"
                   if typing else "no partial prompt sample"))
            pending = next((s for s in samples
                            if s["veil"] > .25 and s["shimmer"] > .1), None)
            check("dot-grid shimmer covers generation",
                  pending is not None,
                  (f"veil {pending['veil']:.2f}, shimmer {pending['shimmer']:.2f}"
                   if pending else "no pending-state sample"))

            # the editor's own last frame, not the slide's: the storefront has
            # replaced it by the time sampling ends
            done_editing = [s for s in samples if s["editor"] > .98][-1]
            check("generated result settles",
                  done_editing["after"] > .98 and done_editing["veil"] < .02
                  and done_editing["shimmer"] < .02,
                  f"after {done_editing['after']:.2f}, veil {done_editing['veil']:.2f}")
            check("production prompt is shown",
                  done_editing["prompt"] == PROMPT,
                  f"{len(done_editing['prompt'])} chars")
            check("genuine result asset is loaded",
                  done_editing["afterNatural"] == [880, 1168],
                  str(done_editing["afterNatural"]))
            check("Add to media resolves active",
                  done_editing["done"] == "rgb(24, 24, 24)", done_editing["done"])
            media_target = [s for s in samples
                            if s["cursor"] > .8 and s["tip"] and s["doneBox"]
                            and s["doneBox"][0] <= s["tip"][0]
                                <= s["doneBox"][0] + s["doneBox"][2]
                            and s["doneBox"][1] <= s["tip"][1]
                                <= s["doneBox"][1] + s["doneBox"][3]]
            check("pointer goes on to Add to media",
                  bool(media_target),
                  f"{len(media_target)} sample(s) with the tip on the button")
            check("pointer clicks Add to media",
                  any(s["doneRing"] > .01 for s in samples),
                  "click ring observed")

            # one pointer, one appearance: it is the same element throughout,
            # it is card 1's size, and once it has arrived it never goes away
            # again — including across the backend -> editor handover, where it
            # used to fade out with one phase and fade back in for the next
            check("pointer is card 1's size",
                  early["cursorBox"] == [18, 25], str(early["cursorBox"]))
            shown = [i for i, s in enumerate(samples) if s["cursor"] > .8]
            blinks = [i for i in range(shown[0], shown[-1] + 1)
                      if samples[i]["cursor"] <= .8] if shown else []
            check("pointer stays visible once it has arrived",
                  bool(shown) and not blinks,
                  f"visible for {len(shown)} of {len(samples) - shown[0]} samples"
                  if shown else "never visible")
            typing_visible = [s for s in samples
                              if 0 < len(s["prompt"]) < len(PROMPT)
                              and s["cursor"] > .8]
            check("pointer is visible while the prompt is typed",
                  bool(typing_visible), f"{len(typing_visible)} sample(s)")

            # the payoff: the generated variant live on the storefront
            hold = [s for s in samples if s["editor"] < .02 and s["site"] > .98]
            check("result holds before the storefront opens",
                  len([s for s in samples if s["editor"] > .98
                       and s["after"] > .98 and s["site"] < .02]) >= 6,
                  f"{len([s for s in samples if s['editor'] > .98 and s['after'] > .98 and s['site'] < .02])} samples")
            check("storefront replaces the editor",
                  bool(hold), f"{len(hold)} settled sample(s)")
            final = samples[-1]
            check("storefront matches card 1's browser at this card's y",
                  final["siteBox"] == [334, 360, 1252, 814], str(final["siteBox"]))
            check("the storefront shows the generated variant",
                  final["sitePhotoNatural"] == [880, 1168]
                  and final["sitePhoto"] > .98,
                  f"{final['sitePhotoNatural']}, photo {final['sitePhoto']:.2f}")
            check("product page carries its own copy",
                  final["siteTitle"].startswith("Ashfold Resurfacing"),
                  repr(final["siteTitle"]))

        check("no page errors", not errors, "; ".join(errors[:3]))
        browser.close()

        red = p.chromium.launch(
            executable_path=str(CHROME) if CHROME else None,
            headless=True, args=["--no-sandbox", "--disable-gpu"])
        pg = red.new_page(viewport={"width": 1920, "height": 1080},
                          reduced_motion="reduce")
        pg.goto(DECK.as_uri())
        pg.wait_for_timeout(700)
        enter(pg)
        pg.wait_for_timeout(100)
        state = read(pg)
        check("reduced motion opens on the storefront",
              state["site"] > .98 and state["sitePhoto"] > .98
              and state["editor"] < .02 and state["backend"] < .02
              and state["after"] > .98 and state["prompt"] == PROMPT,
              f"site {state['site']}, editor {state['editor']}")
        red.close()

    print()
    if fails:
        print(f"{len(fails)} check(s) failed")
        return 1
    print("card 4 replays the catalog-admin AI flow cleanly")
    return 0


if __name__ == "__main__":
    sys.exit(main())

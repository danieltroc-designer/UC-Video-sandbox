# Shots

The animations on uploadcare.com, one card per component, in the studio's **Shots** tab. Every card plays in 16:9, 9:16 and 1:1 (unless it says otherwise), flat or through the Camera look.

| File | |
| --- | --- |
| `deck.html` | The player. Same embed contract as the other decks (`?card=N&format=…&hold`, `__deckInfo/__deckStart/__deckRestart`). |
| `cards.js` | The card schema (top comment) and the order: one module per page in `cards/`. |
| `cards/<page>.js` | The cards for one page. |
| `site/` | Mirrored pages (`home`, `file-uploader`, `image-cdn`, `video-cdn`, `pricing`) and their `_astro/` code. Generated; don't edit. |
| `mirror.mjs` | Refreshes `site/` from the live site: `node library/shots/mirror.mjs`. |

## How a card films a component

- A `site` card loads `site/<page>.html` in a same-origin iframe at desktop size (1440×900 unless `viewport` says otherwise).
  - It scrolls `target` to the middle, plus `scrollOffset` px.
  - It hides everything except `isolate` (default: the target).
  - It hides the navbar.
- The component's own scripts run as on the site: GSAP, IntersectionObserver in-view triggers, timers, CSS animations. The renderer's virtual clock (`render/clock.js`) drives all of it frame-exactly, and holds and seeks `<video>` to virtual time.
- Images stay on Uploadcare's CDN. The renderer waits for them before every frame.
- **The cursor** is a list of waypoints: it glides to `to` (a selector, with `at` as a fraction of its box, or `[x, y]` in page px) and arrives at `t` after `move` seconds; `click: true` clicks there.
  - The player turns the cursor position into a virtual mouse: real `pointer*`/`mouse*` over/enter/move/leave/out events at the element under it, plus a `.uc-hover` class on it and its ancestors.
  - The mirror rewrote every CSS `:hover` to also match `.uc-hover`. So hover styles and hover handlers both work, in the preview and in renders.
- The cursor itself is never drawn: the shots are about the animation. Add `&cursor` to a deck URL to see it while authoring.
- **Animation only.** A card with `plain: { hide: [selectors], css, views }` also comes without its copy (the Shots tab's Text option, `?text=0`, `--no-text` on the CLI). The hidden copy is trimmed out of framed boxes where it runs along their top or bottom edge, so close-ups tighten on the animation. The hero and the bento cards have one.
- **Views** say what the stage frames, per shape: `{ t, el, pad, cover, zoom, dx, dy, dur }`. From `t`, the stage eases over `dur` seconds to frame `el` (one selector or a list; their union).
  - `cover: true` fills the frame and crops; the default fits the whole box.
  - `{ cursor: true, w }` follows the cursor, with `w` page px across.
  - Views keep inside the page where they can.
- `actions`: `{ t, scroll: px, dur }` scrolls the page (for scroll-driven animations); `{ t, call(doc, win) {…} }` runs anything once.
- A `deck` card plays a card of another Library deck as is (the rebuilt homepage demo).

## Authoring a card

1. **Find the component.** Its root and parts are in `site/<page>.html`; its script is `site/_astro/<Name>.astro_astro_type_script…js` (plus the chunks it imports), or an inline `<script type="module">` in the page. Read the script to learn the triggers (in view, `mouseenter`, intervals) and the beats. Measure boxes with a small puppeteer script at 1440×900.
2. **Decide the story.** Make it 4–12 s, starting with the component already in place, and ending on a settled frame or a clean loop point.
   - Bento cards that animate on hover get a cursor that visits each one in turn and stays long enough for its animation to play.
   - Things that animate on their own need no cursor.
3. **Frame it.**
   - 16:9: the whole component, comfortably padded.
   - 9:16 and 1:1: zoom in on the action and follow it (views per hovered element, or `cursor: true`). Text should end up readable on a phone: roughly 22 px or more on the 1080-wide stage.
   - Use `css` to hide anything that gets in the way.
4. **Label it** `<Page> · <Thing>`, e.g. `Home · URL API`, `Image CDN · Dials`. Write the `title` as one line describing the motion.
5. **Check it.**
   - Contact sheets in all three shapes, with enough stills to cover every beat: `node render/render.mjs --deck shots --label "Home · URL API" --format portrait --stills 0.5,1.5,3,… --out <dir>`. Sheets step through time at 30 fps like a video, so hovers on the way count.
   - Add `--camera` for the Camera look, which films the 16:9 layout.
   - Render an MP4 (drop `--stills`) to see the motion.

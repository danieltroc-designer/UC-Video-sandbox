# Library

Booth-deck animations, exportable card by card from the studio's **Library** mode.

| Deck | Source | Cards |
| --- | --- | --- |
| `ecommerce-expo/` | [danieltroc-designer/uc-eccomerce-expo](https://github.com/danieltroc-designer/uc-eccomerce-expo) @ `3df8c5a` | 7 — product flow, benefits, proof point, AI catalog admin, logo wall, infrastructure, booth CTA |
| `webflow-booth/` | [danieltroc-designer/uploadcare-show](https://github.com/danieltroc-designer/uploadcare-show) @ `e122bf0` (the "simple" deck) | 7 — drop-in form, feature row, customer quote, logo wall, install app, how-it-works demo, file board |

Each folder is a vendored copy of the deck's build inputs (`build.py`, `build_simple.py`, `src/simple.template.html`, `assets/`, `tools/`). The copies diverge from their source repos on purpose:

- **Embed mode** (added by `patch_embed.py`): `deck.html?card=N&format=landscape|portrait|square` plays one card with no auto-advance and no kiosk chrome; `&hold` waits for `window.__deckStart()` so the renderer can start the clock. `window.__deckInfo()` lists the cards.
- **Portrait and square layouts**: scoped under `#stage[data-format="portrait"|"square"]`; a card lists the shapes it has been recomposed for in `CARD_FORMATS`. The 16:9 cards stay identical to the source decks.

## Build

```bash
python3 library/build.py                 # both decks
python3 library/build.py ecommerce-expo  # one deck
```

Runs each deck's own build, then moves every inlined `data:` asset out into content-addressed `media/<hash>.<ext>` files next to a small `deck.html` (the inlined Ecommerce build is 14 MB). Only `deck.html` and `media/` are committed and served; `dist/` is an ignored intermediate.

## Export

The decks are live DOM animations, so exporting means rendering them in a browser. `render/` does that frame-exactly in headless Chrome: a virtual clock (`render/clock.js`) replaces the page's timers, `requestAnimationFrame` and every CSS/Web Animation, the renderer steps it exactly 1/fps per frame and screenshots, and a second tab encodes H.264 with WebCodecs.

- **From the studio**: run `npm start`, open `localhost:5173`, switch to **Library**, pick a card, format and quality, and export. Files land in `~/Downloads`. The deployed site previews the Library but can't export (it has no renderer).
- **From the terminal**:
  ```bash
  npm run render -- --deck ecommerce-expo --card 1 --format portrait
  npm run render -- --deck webflow-booth --all --format all --scale 2   # every card, every shape, 4K-class
  ```
- **Layout checks**: `--stills 0.5,2,5` renders those moments into one contact-sheet PNG.
- **Regression**: `node render/regress.mjs --deck <deck>` compares every 16:9 card against a saved baseline (`--save` records one).

Needs a headless Chrome. The renderer finds one in the Puppeteer or Playwright cache; otherwise install one with `npx @puppeteer/browsers install chrome-headless-shell@stable --path ~/.cache/puppeteer`.

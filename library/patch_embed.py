#!/usr/bin/env python3
"""
Adds the UC Video sandbox "single card" embed mode to a vendored deck template.

Idempotent: running it on an already-patched template changes nothing. Kept as a
script (rather than only hand edits) so a fresh copy of a deck from its source
repo can be brought into the sandbox the same way.

    python3 library/patch_embed.py library/<deck>/src/simple.template.html
"""

import sys
from pathlib import Path

MARK = "UC Video sandbox"

CSS_ANCHOR = "  .slide.active{opacity:1;visibility:visible}\n"
CSS = """
  /* ---------- UC Video sandbox: single-card embed (?card=N) ----------
     The stage keeps its 1920-wide design in landscape; portrait and square are
     the phone and feed shapes the sandbox exports. Kiosk chrome never shows. */
  #stage[data-format="portrait"]{width:1080px;height:1920px}
  #stage[data-format="square"]{width:1080px;height:1080px}
  body.embed #gear, body.embed #hint, body.embed #editor, body.embed #io, body.embed #progress{display:none!important}
  body.embed, body.embed *{cursor:none!important}
"""

FIT_OLD = """const stage = document.getElementById('stage');
function fit(){
  const s = Math.min(innerWidth/1920, innerHeight/1080);
  stage.style.transform = `scale(${s})`;
}"""
FIT_NEW = """const stage = document.getElementById('stage');
/* UC Video sandbox embeds one card at a time. ?card=N plays card N on its own
   (no auto-advance, no kiosk chrome); &format=landscape|portrait|square sets
   the stage shape; &hold waits for window.__deckStart() so the renderer can
   start the clock itself once fonts and images are in. */
const EMBED = (()=>{
  const q = new URLSearchParams(location.search);
  if (!q.has('card')) return null;
  const format = ['landscape','portrait','square'].includes(q.get('format')) ? q.get('format') : 'landscape';
  return { card: Math.max(0, parseInt(q.get('card'), 10) || 0), format, hold: q.has('hold') };
})();
if (EMBED){ document.body.classList.add('embed'); stage.dataset.format = EMBED.format; }
/* Shapes each card type has been recomposed for, beyond its original 16:9. */
const CARD_FORMATS = {};
function fit(){
  const s = Math.min(innerWidth/stage.offsetWidth, innerHeight/stage.offsetHeight);
  stage.style.transform = `scale(${s})`;
}"""

BOOT_OLD = """/* boot */
startSubstrate();
renderDeck();
enter(0);"""
BOOT_NEW = """/* boot */
// The sandbox reads the card list from here (titles, types, durations).
window.__deckInfo = ()=>deck.slides.map((s,i)=>({
  index:i, type:s.type, label:TYPE_LABEL[s.type]||s.type, title:slideTitle(s), duration:slideDuration(i)/1000,
  formats:['landscape', ...(CARD_FORMATS[s.type]||[])],
}));
if (EMBED){
  playing = false;                      // one card, no auto-advance
  // Build every card now, so the one we play animates in from its resting
  // (inactive) styles — its entrances are transitions on .slide.active.
  renderDeck();
  let substrate = false;
  const start = ()=>{
    if (!substrate){ substrate = true; startSubstrate(); }
    getComputedStyle(slidesEl).opacity;
    enter(EMBED.card);
  };
  window.__deckStart = start;
  // the sandbox preview restarts a card (or switches card) without a reload
  window.__deckRestart = (card = EMBED.card)=>{ EMBED.card = card; renderDeck(); start(); };
  if (!EMBED.hold) requestAnimationFrame(start);
} else {
  startSubstrate();
  renderDeck();
  enter(0);
}"""


def patch(path: Path) -> None:
    src = path.read_text()
    if MARK in src:
        print(f"{path}: already patched")
        return
    for old, new in ((CSS_ANCHOR, CSS_ANCHOR + CSS), (FIT_OLD, FIT_NEW), (BOOT_OLD, BOOT_NEW)):
        if src.count(old) != 1:
            sys.exit(f"{path}: anchor not found exactly once:\n{old[:120]}")
        src = src.replace(old, new)
    path.write_text(src)
    print(f"{path}: patched")


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        patch(Path(arg))

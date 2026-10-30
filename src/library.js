// Library: the booth decks' animations (library/<deck>/deck.html), one card at
// a time. Preview plays the live deck in an iframe; export goes through the
// local render API (render/api.mjs), which steps the card frame by frame in
// headless Chrome — so it only works when the studio runs on this machine.

export const LIB_DECKS = { 'ecommerce-expo': 'Ecommerce Expo', 'webflow-booth': 'Webflow booth' };
export const LIB_FORMATS = {
  landscape: { label: 'Desktop', ratio: '16:9', w: 1920, h: 1080 },
  portrait: { label: 'Mobile', ratio: '9:16', w: 1080, h: 1920 },
  square: { label: 'Square', ratio: '1:1', w: 1080, h: 1080 },
};
export const LIB_DEFAULTS = { libDeck: 'ecommerce-expo', libCard: 0, libFormat: 'landscape', libScale: 1 };

const LOCAL_HINT = 'Exports render frame by frame on your Mac. In Terminal, run npm start in the project folder, then open localhost:5173.';

const $ = (sel) => document.querySelector(sel);
const fmtTime = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const cardName = (c) => c.label.replace(/^Expo · /, '');

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c != null) node.append(c);
  return node;
}

export function createLibrary({ state, persist, modal }) {
  if (!LIB_DECKS[state.libDeck]) state.libDeck = LIB_DEFAULTS.libDeck;
  if (!LIB_FORMATS[state.libFormat]) state.libFormat = LIB_DEFAULTS.libFormat;

  const frame = $('#libFrame');
  const panel = $('#library');
  let cards = [];
  let active = false;
  let loadedSrc = '';
  let startedAt = 0;
  let api = null;          // null = unknown, false = not running locally
  let job = null;          // { id, cancelled }

  // ------------------------------------------------------------- sidebar

  const deckSeg = el('div', { class: 'segmented' }, Object.entries(LIB_DECKS).map(([id, label]) =>
    el('button', { type: 'button', 'data-deck': id, text: label, onclick: () => selectDeck(id) })));
  const list = el('ol', { class: 'lib-cards' });
  const count = el('span', { class: 'lib-count' });
  const formatSeg = el('div', { class: 'segmented lib-formats' }, Object.entries(LIB_FORMATS).map(([id, f]) =>
    el('button', { type: 'button', 'data-format': id, onclick: () => selectFormat(id) },
      [el('span', { text: f.label }), el('small', { text: f.ratio })])));
  const formatHint = el('p', { class: 'hint' });
  const scaleSeg = el('div', { class: 'segmented' }, [[1, '1080p'], [2, '4K']].map(([k, label]) =>
    el('button', { type: 'button', 'data-scale': k, text: label, onclick: () => { state.libScale = k; persist(); sync(); } })));
  const exportOne = el('button', { class: 'btn primary', type: 'button', text: 'Export card', onclick: () => exportCards([state.libCard]) });
  const exportAll = el('button', { class: 'btn', type: 'button', onclick: () => exportCards(cards.map((c) => c.index)) });
  const exportHint = el('p', { class: 'hint' });

  const field = (label, extra, ...body) => el('div', { class: 'field' }, [
    el('div', { class: 'field-head' }, [el('span', { class: 'field-label', text: label }), extra]), ...body]);
  panel.append(el('details', { class: 'section', open: true }, [
    el('summary', {}, [el('span', { text: 'Library' })]),
    el('div', { class: 'section-body' }, [
      field('Deck', null, deckSeg),
      field('Cards', count, list),
      field('Format', null, formatSeg, formatHint),
      field('Quality', null, scaleSeg),
      el('div', { class: 'lib-actions' }, [exportOne, exportAll]),
      exportHint,
    ]),
  ]));

  function renderList() {
    list.replaceChildren(...cards.map((c) => el('li', {}, el('button', {
      type: 'button', class: 'lib-card', 'data-card': c.index, onclick: () => selectCard(c.index),
    }, [
      el('span', { class: 'lib-num', text: String(c.index + 1).padStart(2, '0') }),
      el('span', { class: 'lib-text' }, [el('b', { text: cardName(c) }), el('small', { text: c.title.replace(/\s+/g, ' ') })]),
      el('span', { class: 'lib-dur', text: `${c.duration}s` }),
    ]))));
    const total = cards.reduce((a, c) => a + c.duration, 0);
    count.textContent = cards.length ? `${cards.length} cards · ${total}s` : '';
    exportAll.textContent = `Export all ${cards.length}`;
  }

  function sync() {
    for (const b of deckSeg.children) b.classList.toggle('is-active', b.dataset.deck === state.libDeck);
    for (const b of list.querySelectorAll('.lib-card')) b.classList.toggle('is-active', Number(b.dataset.card) === state.libCard);
    const card = cards[state.libCard];
    const ready = card?.formats ?? ['landscape'];
    for (const b of formatSeg.children) {
      b.classList.toggle('is-active', b.dataset.format === state.libFormat);
      b.classList.toggle('is-pending', !ready.includes(b.dataset.format));
    }
    formatHint.textContent = ready.includes(state.libFormat) ? ''
      : `${cardName(card || { label: 'This card' })} hasn't been recomposed for ${LIB_FORMATS[state.libFormat].label.toLowerCase()} yet — the preview shows its 16:9 layout on the new stage.`;
    for (const b of scaleSeg.children) b.classList.toggle('is-active', Number(b.dataset.scale) === state.libScale);
    const f = LIB_FORMATS[state.libFormat];
    const size = `${f.w * state.libScale}×${f.h * state.libScale}`;
    exportOne.disabled = exportAll.disabled = api === false || !cards.length;
    exportHint.textContent = api === false ? LOCAL_HINT : `${size} · ${state.fps} fps · saved to your Downloads folder.`;
  }

  // ------------------------------------------------------------- preview

  const srcFor = () => `library/${state.libDeck}/deck.html?card=${state.libCard}&format=${state.libFormat}`;

  function load() {
    const src = srcFor();
    if (src === loadedSrc) return;
    loadedSrc = src;
    frame.src = src;
    fit();
  }

  frame.addEventListener('load', () => {
    const w = frame.contentWindow;
    try {
      cards = w.__deckInfo();
      if (!cards[state.libCard]) { state.libCard = 0; persist(); }
      renderList();
      sync();
    } catch (err) {
      console.error('Library deck failed to load', err);
    }
    startedAt = performance.now();
  });

  function restart() {
    const w = frame.contentWindow;
    if (w?.__deckRestart) { w.__deckRestart(state.libCard); startedAt = performance.now(); }
    else { loadedSrc = ''; load(); }
  }

  function selectDeck(id) {
    if (state.libDeck === id) return;
    state.libDeck = id;
    state.libCard = 0;
    persist();
    cards = [];
    renderList();
    load();
    sync();
  }

  function selectCard(i) {
    state.libCard = i;
    persist();
    sync();
    // same deck and stage shape: switch in place, no reload
    const w = frame.contentWindow;
    if (w?.__deckRestart && loadedSrc.startsWith(`library/${state.libDeck}/`) && loadedSrc.endsWith(`format=${state.libFormat}`)) {
      w.__deckRestart(i);
      loadedSrc = srcFor();
      startedAt = performance.now();
    } else load();
  }

  function selectFormat(id) {
    state.libFormat = id;
    persist();
    load();
    sync();
  }

  function fit() {
    const wrap = $('#stageWrap').getBoundingClientRect();
    const f = LIB_FORMATS[state.libFormat];
    const k = Math.min(wrap.width / f.w, wrap.height / f.h);
    frame.style.width = `${Math.floor(f.w * k)}px`;
    frame.style.height = `${Math.floor(f.h * k)}px`;
  }

  // progress line under the preview; loops the card
  (function tick() {
    if (active) {
      const card = cards[state.libCard];
      if (card) {
        const t = (performance.now() - startedAt) / 1000;
        if (t >= card.duration) restart();
        const shown = Math.min(card.duration, Math.max(0, t));
        $('#libBar').style.width = `${(shown / card.duration) * 100}%`;
        $('#libTime').textContent = `${fmtTime(shown)} / ${fmtTime(card.duration)}`;
        $('#libCardName').textContent = `${String(card.index + 1).padStart(2, '0')} · ${cardName(card)}`;
      }
    }
    requestAnimationFrame(tick);
  })();

  // -------------------------------------------------------------- export

  async function checkApi() {
    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      api = r.ok && (await r.json()).render === true;
    } catch { api = false; }
    sync();
    return api;
  }

  const request = async (path, opts) => {
    const r = await fetch(path, opts);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `${r.status} ${r.statusText}`);
    return body;
  };

  async function exportCards(indices) {
    if (job || !indices.length) return;
    if (!(await checkApi())) {
      modal.open('Export runs locally');
      modal.error(LOCAL_HINT);
      return;
    }
    job = { cancelled: false };
    const { libDeck: deck, libFormat: format, libScale: scale } = state;
    const fps = state.fps;
    const saved = [];
    modal.open(indices.length > 1 ? `Exporting ${indices.length} cards` : 'Exporting card');
    try {
      for (const [n, card] of indices.entries()) {
        if (job.cancelled) break;
        const name = cards[card] ? cardName(cards[card]) : `Card ${card + 1}`;
        const prefix = indices.length > 1 ? `Card ${n + 1} of ${indices.length} · ` : '';
        modal.status(`${prefix}${name} — starting`);
        const { id } = await request('/api/render', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deck, card, format, fps, scale }),
        });
        job.id = id;
        for (;;) {
          await new Promise((r) => setTimeout(r, 350));
          const s = await request(`/api/render/${id}`);
          modal.progress((n + s.progress) / indices.length);
          modal.status(`${prefix}${name} — ${s.status || s.state}`);
          if (s.state === 'done') { saved.push(s.result); break; }
          if (s.state === 'cancelled') { job.cancelled = true; break; }
          if (s.state === 'error') throw new Error(s.error);
        }
      }
      if (job.cancelled) modal.close();
      else {
        const mb = saved.reduce((a, r) => a + r.bytes, 0) / 1e6;
        modal.done(
          saved.length > 1 ? `${saved.length} cards saved` : 'Card saved',
          `${mb.toFixed(1)} MB`,
          saved.length > 1
            ? `Saved to Downloads: ${saved[0].name.replace(/-\d+-.*$/, '')}-01 … ${String(saved.length).padStart(2, '0')}`
            : `Saved to Downloads: ${saved[0].name} · ${saved[0].width}×${saved[0].height} · ${saved[0].duration.toFixed(1)} s`,
        );
      }
    } catch (err) {
      console.error(err);
      modal.error(`Export failed: ${err.message}`);
    } finally {
      job = null;
    }
  }

  async function cancel() {
    if (!job) return false;
    job.cancelled = true;
    if (job.id) await fetch(`/api/render/${job.id}`, { method: 'DELETE' }).catch(() => {});
    return true;
  }

  return {
    get busy() { return !!job; },
    setActive(on) {
      active = on;
      if (on) { load(); fit(); checkApi(); sync(); }
    },
    restart,
    fit,
    sync,
    cancel,
    exportCurrent: () => exportCards([state.libCard]),
  };
}

import { DEFAULTS, SECTIONS, FORMATS, FPS_OPTIONS } from './settings.js';
import { loadLogo } from './logo.js';
import { createRenderer } from './renderer.js';
import { buildSidebar } from './controls.js';
import { exportVideo } from './export.js';

const STORE_KEY = 'uc-title-studio:v1';
const STORE_VERSION = 2; // v2+: only values that differ from the defaults are saved
// Defaults that have changed since v1, which saved every value.
const LEGACY_DEFAULTS = {
  title: 'The complete file\nhandling platform',
  showSubtitle: true,
  glyphPattern: 'spin',
  bgBrightness: 1,
  bgZoom: 6,
  bgDrift: 1,
  shimmer: 0.55,
  shimmerSpeed: 1,
  shimmerAngle: -18,
  spotlight: 0.5,
  vignette: 0.55,
};
const PREVIEW_MAX = 1920; // preview renders at most this many px on the long edge

const $ = (sel) => document.querySelector(sel);
const canvas = $('#stage');
const ctx = canvas.getContext('2d', { alpha: false });

const state = { ...DEFAULTS, ...readStore() };
let renderer, logo, defaultBg, currentBg, sidebar;
let time = 0, duration = 1, timeline = null;
let playing = true, looping = true, dirty = true, scrubbing = false;
let exportAbort = null;

function readStore() {
  // Choice controls only accept their listed options, so values saved by an
  // older version (e.g. a removed animation) fall back to the default.
  const CHOICES = Object.fromEntries(SECTIONS.flatMap((sec) => sec.controls)
    .filter((c) => c.options).map((c) => [c.key, c.options.map(([v]) => v)]));
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (saved.v !== STORE_VERSION) {
      // Old saves held the whole state: values equal to the defaults of the time
      // were never customised, so let the current defaults through instead.
      for (const [k, v] of Object.entries(LEGACY_DEFAULTS)) if (saved[k] === v) delete saved[k];
    }
    return Object.fromEntries(Object.entries(saved)
      .filter(([k, v]) => k in DEFAULTS && (!CHOICES[k] || CHOICES[k].includes(v))));
  } catch { return {}; }
}

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    // Only keep what differs from the defaults, so improved defaults reach existing users.
    const changed = Object.fromEntries(Object.entries(state).filter(([k, v]) => v !== DEFAULTS[k]));
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ v: STORE_VERSION, ...changed })); } catch { /* storage unavailable */ }
  }, 250);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

function outputSize() {
  const f = FORMATS[state.format] ?? FORMATS[DEFAULTS.format];
  return [f.w, f.h];
}

// ------------------------------------------------------------------ preview

function prepare() {
  const [w, h] = outputSize();
  const k = Math.min(1, PREVIEW_MAX / Math.max(w, h));
  const pw = Math.round(w * k), ph = Math.round(h * k);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
    fitStage();
  }
  ({ duration, timeline } = renderer.prepare(state, pw, ph));
  time = Math.min(time, duration);
  drawTimeline();
  dirty = true;
}

function fitStage() {
  const wrap = $('#stageWrap');
  const { width, height } = wrap.getBoundingClientRect();
  const k = Math.min(width / canvas.width, height / canvas.height);
  canvas.style.width = `${Math.floor(canvas.width * k)}px`;
  canvas.style.height = `${Math.floor(canvas.height * k)}px`;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (playing && !scrubbing) {
    time += dt;
    if (time >= duration) {
      if (looping) time %= duration;
      else { time = duration; setPlaying(false); }
    }
    dirty = true;
  }
  if (dirty) {
    renderer.render(ctx, time);
    updatePlayhead();
    dirty = false;
  }
  requestAnimationFrame(frame);
}

function setPlaying(v) {
  playing = v;
  if (playing && time >= duration - 1e-3) time = 0;
  $('#play').classList.toggle('is-playing', playing);
  $('#play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
}

function seek(t) {
  time = Math.max(0, Math.min(duration, t));
  dirty = true;
}

// ----------------------------------------------------------------- timeline

const fmt = (t) => {
  const m = Math.floor(t / 60);
  const sec = (t - m * 60).toFixed(2).padStart(5, '0');
  return `${m}:${sec}`;
};

function drawTimeline() {
  const lanesEl = $('#segments');
  lanesEl.replaceChildren();
  const laneEnds = [];
  for (const seg of timeline.segments) {
    let lane = laneEnds.findIndex((end) => end <= seg.start + 1e-3);
    if (lane === -1) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = seg.end;
    const node = document.createElement('div');
    node.className = `seg seg-${seg.id}`;
    node.style.left = `${(seg.start / duration) * 100}%`;
    node.style.width = `${(Math.max(0.0001, seg.end - seg.start) / duration) * 100}%`;
    node.style.top = `${lane * 16}px`;
    node.dataset.start = seg.start;
    node.dataset.end = seg.end;
    node.title = `${seg.label} · ${seg.start.toFixed(2)}s – ${seg.end.toFixed(2)}s`;
    node.textContent = seg.label;
    lanesEl.append(node);
  }
  lanesEl.style.height = `${laneEnds.length * 16}px`;
  $('#dur').textContent = fmt(duration);
}

function updatePlayhead() {
  $('#playhead').style.left = `${(time / duration) * 100}%`;
  $('#cur').textContent = fmt(time);
  for (const node of $('#segments').children) {
    node.classList.toggle('is-active', time >= Number(node.dataset.start) && time <= Number(node.dataset.end));
  }
}

function bindTimeline() {
  const tl = $('#timeline');
  const toTime = (e) => {
    const r = tl.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * duration;
  };
  tl.addEventListener('pointerdown', (e) => {
    scrubbing = true;
    tl.setPointerCapture(e.pointerId);
    seek(toTime(e));
  });
  tl.addEventListener('pointermove', (e) => scrubbing && seek(toTime(e)));
  const end = () => { scrubbing = false; };
  tl.addEventListener('pointerup', end);
  tl.addEventListener('pointercancel', end);
}

// ------------------------------------------------------------------- export

function exportFilename(ext) {
  const [w, h] = outputSize();
  const slug = (state.showTitle ? state.title : 'intro')
    .replace(/\*/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'intro';
  return `uploadcare-${slug}-${w}x${h}.${ext}`;
}

// Object URLs live until they're replaced. Revoking on a timer made Safari save
// an empty file when its "Allow downloads?" prompt was answered too late.
const liveUrls = new Map();
function blobUrl(kind, blob) {
  if (liveUrls.has(kind)) URL.revokeObjectURL(liveUrls.get(kind));
  const url = URL.createObjectURL(blob);
  liveUrls.set(kind, url);
  return url;
}

function triggerDownload(url, filename) {
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
}

async function runExport() {
  if (exportAbort) return;
  const [w, h] = outputSize();
  const modal = $('#exportModal');
  const title = $('#exportTitle');
  const bar = $('#exportBar');
  const pct = $('#exportPct');
  const status = $('#exportStatus');
  const link = $('#exportDownload');
  const close = $('#exportCancel');
  setPlaying(false);
  modal.hidden = false;
  modal.classList.remove('is-error', 'is-done');
  title.textContent = 'Exporting video';
  status.textContent = `Rendering ${w}×${h} at ${state.fps} fps`;
  bar.style.width = '0%';
  pct.textContent = '0%';
  link.hidden = true;
  close.textContent = 'Cancel';
  exportAbort = new AbortController();
  try {
    const { blob, method } = await exportVideo({
      settings: { ...state }, logo, background: currentBg, width: w, height: h, fps: state.fps,
      signal: exportAbort.signal,
      onProgress: (p) => { bar.style.width = `${p * 100}%`; pct.textContent = `${Math.round(p * 100)}%`; },
      onStatus: (msg) => { status.textContent = msg; },
    });
    // Download from a real click: the export took a while, so the original
    // click no longer counts as a user gesture and Safari may block or prompt.
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    Object.assign(link, { href: blobUrl('video', blob), download: exportFilename(ext) });
    link.lastChild.textContent = ` Download ${ext.toUpperCase()}`;
    link.hidden = false;
    modal.classList.add('is-done');
    title.textContent = 'Video ready';
    bar.style.width = '100%';
    pct.textContent = `${(blob.size / 1e6).toFixed(1)} MB`;
    status.textContent = `${w}×${h} · ${state.fps} fps · ${method}`;
    close.textContent = 'Close';
    link.focus();
  } catch (err) {
    if (err.name === 'AbortError') modal.hidden = true;
    else {
      console.error(err);
      modal.classList.add('is-error');
      status.textContent = `Export failed: ${err.message}`;
      close.textContent = 'Close';
    }
  } finally {
    exportAbort = null;
  }
}

function snapshot() {
  const [w, h] = outputSize();
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const r = createRenderer({ logo });
  r.setBackground(currentBg);
  r.prepare({ ...state }, w, h);
  r.render(c.getContext('2d', { alpha: false }), time);
  const name = exportFilename('png').replace('.png', `-${time.toFixed(2)}s.png`);
  c.toBlob((blob) => blob && triggerDownload(blobUrl('png', blob), name), 'image/png');
}

// --------------------------------------------------------------------- boot

function bindTopbar() {
  const format = $('#format');
  format.replaceChildren(...Object.entries(FORMATS).map(([value, f]) => new Option(f.label, value)));
  format.value = state.format;
  format.addEventListener('change', () => { state.format = format.value; persist(); prepare(); });

  const fps = $('#fps');
  fps.replaceChildren(...FPS_OPTIONS.map((v) => new Option(`${v} fps`, v)));
  fps.value = state.fps;
  fps.addEventListener('change', () => { state.fps = Number(fps.value); persist(); });

  $('#export').addEventListener('click', runExport);
  $('#exportCancel').addEventListener('click', () => {
    if (exportAbort) exportAbort.abort();
    else $('#exportModal').hidden = true;
  });
  $('#snapshot').addEventListener('click', snapshot);
  $('#play').addEventListener('click', () => setPlaying(!playing));
  $('#restart').addEventListener('click', () => { seek(0); setPlaying(true); });
  $('#loop').addEventListener('click', () => {
    looping = !looping;
    $('#loop').classList.toggle('is-active', looping);
    $('#loop').setAttribute('aria-pressed', String(looping));
  });
  $('#reset').addEventListener('click', () => {
    Object.assign(state, DEFAULTS);
    $('#format').value = state.format;
    $('#fps').value = state.fps;
    setBackground(null);
    sidebar.sync();
    persist();
    prepare();
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    const step = (e.shiftKey ? 10 : 1) / state.fps;
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); setPlaying(false); seek(time - step); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); setPlaying(false); seek(time + step); }
    else if (e.code === 'Home') { seek(0); }
    else if (e.code === 'End') { setPlaying(false); seek(duration); }
  });
}

async function setBackground(file) {
  currentBg = file ? await loadImage(URL.createObjectURL(file)) : defaultBg;
  renderer.setBackground(currentBg);
  prepare();
}

async function waitForFonts() {
  const link = $('#fontCss');
  const timeout = (ms) => new Promise((r) => setTimeout(r, ms));
  // Offline the stylesheet never loads — fall back to system fonts after a moment.
  if (!link.sheet) await Promise.race([new Promise((r) => { link.onload = r; link.onerror = r; }), timeout(3000)]);
  const faces = ['600 100px Inter', '500 32px Inter', '400 32px Inter'].map((f) => document.fonts.load(f));
  await Promise.race([Promise.all(faces).catch(() => {}), timeout(4000)]);
}

async function boot() {
  await waitForFonts();
  [logo, defaultBg] = await Promise.all([loadLogo('assets/lockup-dark.svg'), loadImage('assets/background.webp')]);
  currentBg = defaultBg;
  renderer = createRenderer({ logo });
  renderer.setBackground(currentBg);

  sidebar = buildSidebar($('#controls'), {
    sections: SECTIONS,
    state,
    defaults: DEFAULTS,
    onChange: () => { persist(); prepare(); },
    onImage: (file) => setBackground(file),
  });
  bindTopbar();
  bindTimeline();
  new ResizeObserver(fitStage).observe($('#stageWrap'));
  // Re-measure text if a font face finishes loading late.
  document.fonts.addEventListener('loadingdone', () => prepare());

  prepare();
  fitStage();
  setPlaying(true);
  document.body.classList.add('is-ready');
  requestAnimationFrame(frame);

  // Handy for scripting from the console: __studio.seek(2.5), __studio.play(false)…
  window.__studio = {
    state, seek, play: setPlaying, refresh: () => { sidebar.sync(); prepare(); },
    // Renders frames at the given times into an overlay grid (debugging aid).
    contactSheet(times, cols = 3, zoom = 1, fy = 0.5) {
      document.getElementById('__sheet')?.remove();
      const sheet = Object.assign(document.createElement('div'), { id: '__sheet' });
      sheet.style.cssText = `position:fixed;inset:0;z-index:99;background:#111;display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:4px;align-content:start;overflow:auto`;
      sheet.onclick = () => sheet.remove();
      const [w, h] = [canvas.width, canvas.height];
      for (const t of times) {
        const full = document.createElement('canvas');
        full.width = w; full.height = h;
        renderer.render(full.getContext('2d'), t);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.style.cssText = 'width:100%;display:block';
        const cw = w / zoom, ch = h / zoom;
        c.getContext('2d').drawImage(full, (w - cw) / 2, Math.min(h - ch, Math.max(0, h * fy - ch / 2)), cw, ch, 0, 0, w, h);
        const fig = document.createElement('div');
        fig.style.cssText = 'position:relative';
        fig.innerHTML = `<span style="position:absolute;left:6px;top:4px;font:11px Inter;color:#fff;background:#0008;padding:1px 5px;border-radius:3px">${t.toFixed(2)}s</span>`;
        fig.prepend(c);
        sheet.append(fig);
      }
      document.body.append(sheet);
    },
    get time() { return time; }, get duration() { return duration; }, get timeline() { return timeline; },
  };
}

boot().catch((err) => {
  console.error(err);
  $('#bootError').hidden = false;
  $('#bootError').textContent = `Couldn't start: ${err.message}. Serve this folder over http (npm start).`;
});

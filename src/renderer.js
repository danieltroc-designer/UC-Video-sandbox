import { clamp, lerp, progress, ease, cubicBezier, mixColor, rgba, hash } from './easing.js';
import { GLYPH_MOTIONS, FILL_CURVE } from './glyph-motions.js';

const fillEase = cubicBezier(...FILL_CURVE);

// Inter's cap height as a fraction of the em — used to centre lines optically.
const CAP = 0.727;
// Simulated shutter: how far back in time the motion-blur trail reaches.
const SHUTTER = 1 / 30;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function makeGrainTiles(count, size) {
  return Array.from({ length: count }, (_, k) => {
    const c = makeCanvas(size, size);
    const x = c.getContext('2d');
    const img = x.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = hash(i * 7 + k * 104729) + hash(i * 13 + k * 7919) + hash(i * 3 + k * 31) - 1.5;
      const v = clamp(128 + n * 110, 0, 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  });
}

/**
 * A resolution-independent, deterministic renderer: render(ctx, t) always
 * produces the same frame for the same settings and time, which is what
 * makes frame-accurate export possible.
 */
export function createRenderer({ logo }) {
  let W = 0, H = 0, u = 1;
  let s = null; // settings
  let L = null; // layout
  let T = null; // timeline
  let bgImage = null;
  let bgBase = null, bgHi = null, bakeKey = '';
  const layers = new Map();
  const motionCache = new Map();
  const grain = makeGrainTiles(4, 256);
  const measure = makeCanvas(8, 8).getContext('2d');

  // An offscreen canvas the size of the frame, or `k` times it for soft
  // things (masks, glows) where a cheap low-res blur looks the same.
  function layer(name, k = 1) {
    const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
    let c = layers.get(name);
    if (!c) layers.set(name, (c = makeCanvas(w, h)));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const x = c.getContext('2d');
    x.setTransform(k, 0, 0, k, 0, 0); // draw in frame coordinates
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
    x.filter = 'none';
    return [c, x];
  }

  function setBackground(img) {
    bgImage = img;
    bakeKey = '';
  }

  // ---------------------------------------------------------------- prepare

  function prepare(settings, width, height) {
    s = settings;
    W = width;
    H = height;
    u = Math.min(W, H) / 1080;
    bakeBackground();
    L = computeLayout();
    T = computeTimeline();
    return { duration: T.duration, timeline: T };
  }

  function bakeBackground() {
    const key = [W, H, s.bgBrightness, s.bgFlip, bgImage?.src].join('|');
    if (key === bakeKey) return;
    bakeKey = key;
    bgBase = bake(`brightness(${s.bgBrightness})`);
    // High-contrast copy that isolates the light bands; the sweep reveals it.
    bgHi = bake(`grayscale(1) brightness(${2.4 * s.bgBrightness}) contrast(2.4)`);
  }

  function bake(filter) {
    const c = makeCanvas(W, H);
    const x = c.getContext('2d');
    x.fillStyle = '#000';
    x.fillRect(0, 0, W, H);
    if (!bgImage) return c;
    const iw = bgImage.naturalWidth || bgImage.width;
    const ih = bgImage.naturalHeight || bgImage.height;
    const k = Math.max(W / iw, H / ih);
    if (s.bgFlip) { x.translate(W, 0); x.scale(-1, 1); }
    x.filter = filter;
    x.drawImage(bgImage, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k);
    return c;
  }

  function splitAccent(text) {
    // Turns "deliver *any file*" into tokens with an accent flag.
    const lines = [];
    let inAccent = false;
    for (const raw of text.split('\n')) {
      const words = [];
      for (let tok of raw.trim().split(/\s+/).filter(Boolean)) {
        let accent = inAccent;
        if (tok.startsWith('*')) { tok = tok.slice(1); accent = inAccent = true; }
        if (tok.includes('*')) { tok = tok.replace(/\*/g, ''); inAccent = false; }
        if (tok) words.push({ text: tok, accent });
      }
      if (words.length) lines.push(words);
    }
    return lines;
  }

  function wrap(lines, maxW, space) {
    const out = [];
    for (const words of lines) {
      let cur = [], curW = 0;
      for (const w of words) {
        if (cur.length && curW + space + w.w > maxW) { out.push(cur); cur = []; curW = 0; }
        curW += (cur.length ? space : 0) + w.w;
        cur.push(w);
      }
      if (cur.length) out.push(cur);
    }
    return out;
  }

  function computeLayout() {
    const m = measure;
    const maxW = W * 0.86;
    const out = { logo: null, title: { words: [], lines: [] }, sub: { lines: [] }, url: null };

    // Title — shrinks to fit (down to 70%) before it starts wrapping.
    if (s.showTitle && s.title.trim()) {
      const parsed = splitAccent(s.title);
      const fontAt = (size) => {
        m.font = `600 ${size}px Inter`;
        m.letterSpacing = `${(s.titleTracking / 100) * size}px`;
      };
      let size = s.titleSize * u;
      fontAt(size);
      const lineWidth = (ws) => ws.reduce((a, w) => a + m.measureText(w.text).width, 0) + m.measureText(' ').width * (ws.length - 1);
      const widest = Math.max(...parsed.map(lineWidth));
      if (widest > maxW) size *= Math.max(0.7, maxW / widest);
      fontAt(size);
      const space = m.measureText(' ').width;
      for (const ws of parsed) for (const w of ws) w.w = m.measureText(w.text).width;
      const lines = wrap(parsed, maxW, space);
      out.title = {
        size, space,
        font: m.font,
        tracking: m.letterSpacing,
        lineH: size * s.titleLeading,
        lines, words: lines.flat(),
      };
    }

    if (s.showSubtitle && s.subtitle.trim()) {
      const size = s.subtitleSize * u;
      m.font = `${s.subtitleWeight} ${size}px Inter`;
      m.letterSpacing = '0px';
      const parsed = s.subtitle.split('\n').map((l) => l.trim().split(/\s+/).filter(Boolean).map((text) => ({ text })));
      for (const ws of parsed) for (const w of ws) w.w = m.measureText(w.text).width;
      const space = m.measureText(' ').width;
      const lines = wrap(parsed.filter((l) => l.length), maxW * 0.9, space).map((ws) => {
        const text = ws.map((w) => w.text).join(' ');
        return { text, w: m.measureText(text).width };
      });
      out.sub = { size, font: m.font, lineH: size * 1.45, lines };
    }

    if (s.showUrl && s.url.trim()) {
      const size = s.urlSize * u;
      m.font = `500 ${size}px Inter`;
      m.letterSpacing = `${0.01 * size}px`;
      const text = s.url.trim();
      const tw = m.measureText(text).width;
      const pill = s.urlStyle === 'pill';
      const h = pill ? size * 2.25 : size * 1.3;
      const dot = pill ? size * 0.34 : 0;
      const gap = pill ? size * 0.55 : 0;
      const padX = pill ? size * 0.95 : 0;
      out.url = { size, font: m.font, tracking: m.letterSpacing, text, tw, h, dot, gap, padX, pill, w: padX * 2 + dot + gap + tw };
    }

    const hasBody = out.title.lines.length || out.sub.lines.length || out.url;

    // Vertical stack: [lockup] [title] [subtitle] [url], centred as one block.
    const blocks = [];
    if (s.showLogo) {
      const s0 = (s.logoIntro * u) / logo.bounds.w;
      const s1 = hasBody ? (s.logoFinal * u) / logo.bounds.w : s0;
      out.logo = { s0, s1, x0: W / 2, y0: H / 2, x1: W / 2, y1: H / 2 };
      if (hasBody) blocks.push({ kind: 'logo', h: logo.bounds.h * s1 });
    }
    if (out.title.lines.length) blocks.push({ kind: 'title', h: out.title.lines.length * out.title.lineH });
    if (out.sub.lines.length) blocks.push({ kind: 'sub', h: out.sub.lines.length * out.sub.lineH });
    if (out.url) blocks.push({ kind: 'url', h: out.url.h });

    const GAPS = { 'logo>title': 62, 'logo>sub': 48, 'logo>url': 48, 'title>sub': 40, 'title>url': 64, 'sub>url': 46 };
    const gap = (a, b) => (GAPS[`${a}>${b}`] ?? 40) * u * s.spacing;
    const total = blocks.reduce((acc, b, i) => acc + b.h + (i ? gap(blocks[i - 1].kind, b.kind) : 0), 0);
    let y = H / 2 - total / 2 + s.offsetY * u;

    blocks.forEach((b, i) => {
      if (i) y += gap(blocks[i - 1].kind, b.kind);
      if (b.kind === 'logo') out.logo.y1 = y + b.h / 2;
      if (b.kind === 'title') {
        const ti = out.title;
        ti.top = y;
        ti.bottom = y + b.h;
        ti.lines.forEach((ws, li) => {
          const lw = ws.reduce((a, w) => a + w.w, 0) + ti.space * (ws.length - 1);
          const baseline = y + li * ti.lineH + (ti.lineH + CAP * ti.size) / 2;
          let x = W / 2 - lw / 2;
          for (const w of ws) { w.x = x; w.baseline = baseline; x += w.w + ti.space; }
        });
        ti.words.forEach((w, i) => (w.index = i));
      }
      if (b.kind === 'sub') {
        const sb = out.sub;
        sb.lines.forEach((ln, li) => {
          ln.x = W / 2 - ln.w / 2;
          ln.baseline = y + li * sb.lineH + (sb.lineH + CAP * sb.size) / 2;
        });
      }
      if (b.kind === 'url') {
        const ul = out.url;
        ul.x = W / 2 - ul.w / 2;
        ul.y = y;
        ul.baseline = y + (ul.h + CAP * ul.size) / 2;
      }
      y += b.h;
    });

    return out;
  }

  // Fixed length: every animation time scales with the pace k and only the
  // hold doesn't, so total = k · (natural length without hold) + hold — solve
  // for k so the whole piece lands exactly on the chosen length.
  function computeTimeline() {
    if (!s.fitLength) return buildTimeline(1 / s.speed, s.hold);
    const hold = Math.max(0.3, s.length * 0.2);
    const natural = buildTimeline(1, 0).duration;
    return buildTimeline(Math.max(0.05, (s.length - hold) / natural), hold);
  }

  function buildTimeline(k, holdFor) {
    const st = s.stagger;
    const tl = { segments: [], k };
    const seg = (id, label, start, end = start) => {
      const o = { id, label, start, end };
      tl[id] = o;
      tl.segments.push(o);
      return o;
    };

    seg('bg', 'Background', 0, s.revealDuration * k);
    const nWords = L.title.words.length;
    const nSub = L.sub.lines.length;
    const hasBody = nWords || nSub || L.url;
    let next = 0.35 * k;
    let end = tl.bg.end;

    if (L.logo) {
      const gm = glyphMotion();
      const g = seg('glyph', 'Mark', 0.12 * k);
      g.delays = gm.delays.map((d) => d * k * st);
      g.dur = gm.fill * k;
      g.end = g.start + gm.spread * k * st + g.dur;

      // Quick builds (ripple) still get a beat on screen before the wordmark.
      const w = seg('word', 'Wordmark', Math.max(g.end - 0.3 * k, g.start + 0.8 * k));
      w.stagger = 0.045 * k * st;
      w.dur = 0.62 * k;
      w.end = w.start + w.stagger * (logo.letters.length - 1) + w.dur;
      tl.shift = { start: w.start - 0.1 * k, end: w.end - 0.12 * k };
      end = Math.max(end, w.end);
      next = end;

      if (hasBody) {
        const mv = seg('move', 'Lockup', w.end + 0.15 * k, w.end + 0.9 * k);
        next = mv.start + 0.46 * k;
        end = mv.end;
      }
    }

    if (nWords) {
      const t = seg('title', 'Title', next);
      t.stagger = 0.085 * k * st;
      t.dur = 0.9 * k;
      t.end = t.start + t.stagger * (nWords - 1) + t.dur;
      next = t.start + Math.min(t.stagger * (nWords - 1), 0.7 * k) + 0.45 * k;
      end = Math.max(end, t.end);
    }

    if (nSub) {
      const sb = seg('sub', 'Subtitle', next);
      sb.stagger = 0.13 * k * st;
      sb.dur = 1.0 * k;
      sb.end = sb.start + sb.stagger * (nSub - 1) + sb.dur;
      next = sb.start + sb.stagger * (nSub - 1) + 0.4 * k;
      end = Math.max(end, sb.end);
    }

    if (L.url) {
      const ur = seg('url', 'URL', next, next + 0.85 * k);
      end = Math.max(end, ur.end);
    }

    const hold = seg('hold', 'Hold', end, end + holdFor);
    tl.duration = hold.end;
    if (s.outro) tl.duration = seg('outro', 'Outro', hold.end, hold.end + 1.0 * k).end;
    return tl;
  }

  // Per-square start delays and fill duration (seconds, before speed/stagger)
  // for the chosen mark animation.
  function glyphMotion() {
    const key = `${s.glyphPattern}|${s.glyphStyle}`;
    if (motionCache.has(key)) return motionCache.get(key);
    const g = logo.glyph;
    const table = GLYPH_MOTIONS[s.glyphPattern];
    let delays;
    if (table) {
      // The loaders share the glyph's 8×8 grid, so map squares onto it directly.
      const pitch = (g.w - logo.squares[0].w) / 7;
      delays = logo.squares.map((q) =>
        (table.delays[Math.round((q.y - g.y) / pitch)]?.[Math.round((q.x - g.x) / pitch)] ?? 0) / 1000);
    } else {
      const raw = logo.squares.map((q, i) => (s.glyphPattern === 'random'
        ? hash(i * 31 + 7)
        : (Math.atan2(q.cy - g.cy, q.cx - g.cx) + Math.PI * 2.5) % (Math.PI * 2))); // spin: clockwise from 12 o'clock
      const lo = Math.min(...raw), hi = Math.max(...raw);
      delays = raw.map((v) => ((v - lo) / (hi - lo || 1)) * 0.62);
    }
    const fill = s.glyphStyle === 'pop' ? 0.5 : table?.fill ?? 0.34;
    const out = { delays, fill, spread: Math.max(...delays) };
    motionCache.set(key, out);
    return out;
  }

  // ----------------------------------------------------------------- render

  function render(ctx, t) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const o = T.outro ? progress(t, T.outro.start, T.outro.end) : 0;
    const out = ease.inOutCubic(clamp(o / 0.7));
    const fx = { alpha: 1 - out, blur: out * 22 * u, lift: -out * 18 * u };

    drawBackground(ctx, t, ease.inOutCubic(clamp((o - 0.25) / 0.75)));
    if (L.logo) drawLockup(ctx, t, fx);
    if (T.title) drawTitle(ctx, t, fx);
    if (T.sub) drawSubtitle(ctx, t, fx);
    if (T.url) drawUrl(ctx, t, fx);
    drawGrain(ctx, t);
    ctx.restore();
  }

  function camera(t, settle = 0) {
    const p = ease.outQuad(clamp(t / Math.max(T.duration, 0.001)));
    const amp = s.bgFlow * 9 * u; // how far the streaks undulate, in px
    // Extra zoom gives the flow headroom so the frame edges never show.
    const zoom = (1.02 + (2.2 * amp) / H + (s.bgZoom / 100) * p) * (1 + 0.07 * settle);
    const roomX = ((zoom - 1) * W) / 2;
    const roomY = ((zoom - 1) * H) / 2 - amp * zoom;
    const px = clamp((p - 0.5) * s.bgDrift * 0.02 * W, -roomX, roomX);
    const py = clamp((0.5 - p) * s.bgDrift * 0.01 * H, -roomY, roomY);
    return { zoom, px, py, amp, phase: t * s.bgFlowSpeed };
  }

  function drawCam(c, img, cam) {
    c.save();
    c.translate(W / 2 + cam.px, H / 2 + cam.py);
    c.scale(cam.zoom, cam.zoom);
    if (cam.amp < 0.05) {
      c.drawImage(img, -W / 2, -H / 2, W, H);
    } else {
      // Fabric-like flow: thin vertical strips, each nudged up or down by two
      // slow, overlapping sine waves. Strips overlap by 1px to hide seams.
      const strip = Math.max(4, Math.round(6 * u));
      const TAU = Math.PI * 2;
      for (let x = 0; x < W; x += strip) {
        const sw = Math.min(strip + 1, W - x);
        const nx = (x + strip / 2) / W;
        const dy = cam.amp * (0.65 * Math.sin(TAU * (nx * 0.8 + cam.phase / 11))
          + 0.35 * Math.sin(TAU * (nx * 1.9 - cam.phase / 7.5) + 1.3));
        c.drawImage(img, x, 0, sw, H, x - W / 2, -H / 2 + dy, sw, H);
      }
    }
    c.restore();
  }

  const CORNERS = { 'bottom-left': [0, 1], 'top-left': [0, 0], 'top-right': [1, 0], 'bottom-right': [1, 1] };

  // How far the background is uncovered (0–1). Soft grows out of a corner and
  // shrinks back into it for the outro; fade just changes opacity.
  function reveal(t, fadeOut) {
    const p = progress(t, T.bg.start, T.bg.end);
    if (s.revealStyle === 'fade') return { open: 1, alpha: ease.outCubic(p) * (1 - fadeOut) };
    return { open: ease.outCubic(p) * (1 - fadeOut), alpha: 1 };
  }

  function drawBackground(ctx, t, fadeOut) {
    const { open, alpha } = reveal(t, fadeOut);
    if (open <= 0 || alpha <= 0) return;
    const masked = open < 1;
    const cam = camera(t, masked ? 1 - open : 0);
    if (!masked) {
      paintBackground(ctx, t, cam, alpha);
      return;
    }
    const [lc, c] = layer('bg');
    paintBackground(c, t, cam, 1);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(revealMask(open), 0, 0, W, H);
    ctx.drawImage(lc, 0, 0);
  }

  // A very wide, smoothly feathered radial from the corner (like the card
  // hover), so the reveal reads as light spreading rather than a visible edge.
  function revealMask(open) {
    const [mc, m] = layer('mask', 0.25);
    m.clearRect(0, 0, W, H);
    const [fx, fy] = CORNERS[s.revealCorner] ?? CORNERS['bottom-left'];
    const diag = Math.hypot(W, H);
    const feather = diag * 1.1;
    const r = Math.max(1, open * (diag + feather));
    const inner = clamp((r - feather) / r);
    const g = m.createRadialGradient(fx * W, fy * H, 0, fx * W, fy * H, r);
    for (let i = 0; i <= 8; i++) {
      const x = i / 8;
      g.addColorStop(inner + (1 - inner) * x, `rgba(0,0,0,${1 - x * x * (3 - 2 * x)})`); // smoothstep falloff
    }
    m.fillStyle = g;
    m.fillRect(0, 0, W, H);
    return mc;
  }

  function paintBackground(ctx, t, cam, a) {
    ctx.globalAlpha = a;
    drawCam(ctx, bgBase, cam);

    if (s.spotlight > 0) {
      const grow = ease.outCubic(progress(t, 0.05, T.glyph ? T.glyph.end : 1.2 * T.k));
      const r = Math.max(W, H) * lerp(0.28, 0.62, grow);
      const cx = W / 2, cy = H * 0.47;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const peak = 0.2 * s.spotlight * grow;
      g.addColorStop(0, rgba(s.spotColor, peak));
      g.addColorStop(0.45, rgba(s.spotColor, peak * 0.35));
      g.addColorStop(1, rgba(s.spotColor, 0));
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    if (s.shimmer > 0) {
      // A soft band sweeps across; masking the high-contrast background with it
      // makes light appear to travel along the existing streaks.
      const [sc, sx] = layer('shimmer');
      drawCam(sx, bgHi, cam);
      const period = 5.5 / s.shimmerSpeed;
      const ph = (((t + period * 0.12) / period) % 1 + 1) % 1;
      const D = Math.hypot(W, H) / 2;
      const bw = W * 0.32;
      const pos = lerp(-D - bw, D + bw, ph);
      sx.globalCompositeOperation = 'destination-in';
      sx.translate(W / 2, H / 2);
      sx.rotate((s.shimmerAngle * Math.PI) / 180);
      const g = sx.createLinearGradient(pos - bw, 0, pos + bw, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      sx.fillStyle = g;
      sx.fillRect(-D * 1.5, -D * 1.5, D * 3, D * 3);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * s.shimmer * 0.6;
      ctx.drawImage(sc, 0, 0);
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (s.vignette > 0) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) / 2);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${0.85 * s.vignette})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawLockup(ctx, t, fx) {
    const [lc, c] = layer('lockup');
    c.clearRect(0, 0, W, H);
    const lg = L.logo;
    const G = T.glyph, Wd = T.word, M = T.move;
    const moveEase = (x) => ease.inOutQuart(progress(x, M.start, M.end));
    const pm = M ? moveEase(t) : 0;
    const cx = lerp(lg.x0, lg.x1, pm);
    const cy = lerp(lg.y0, lg.y1, pm) + fx.lift;
    const sc = lerp(lg.s0, lg.s1, pm);

    // The mark starts centred alone, then slides over as the wordmark writes on.
    const pS = ease.inOutCubic(progress(t, T.shift.start, T.shift.end));
    const focusX = lerp(logo.glyph.cx, logo.bounds.cx, pS);
    const ox = cx - focusX * sc;
    const oy = cy - logo.bounds.cy * sc;
    c.setTransform(sc, 0, 0, sc, ox, oy);

    // Mark. Fill: an empty grid fades up, then squares fill with brand colour
    // like the loaders. Pop: squares scale in, flashing white → brand.
    const gp = progress(t, G.start, G.end);
    const pop = s.glyphStyle === 'pop';
    const gs = pop ? lerp(0.9, 1, ease.outCubic(gp)) : 1;
    const ghost = pop ? 0 : ease.outCubic(progress(t, 0, G.start + 0.3 * T.k));
    const gcx = logo.glyph.cx, gcy = logo.glyph.cy;
    logo.squares.forEach((q, i) => {
      const a0 = G.start + G.delays[i];
      const p = progress(t, a0, a0 + G.dur);
      let half = q.size / 2;
      if (pop) {
        if (p <= 0) return;
        half *= Math.max(0, ease.outBack(p, 2.2)) * gs;
        c.globalAlpha = clamp(p * 6);
        c.fillStyle = mixColor('#fffbea', s.glyphColor, ease.outCubic(clamp((p - 0.15) / 0.55)));
      } else {
        const e = fillEase(p);
        if (ghost <= 0 && e <= 0) return;
        c.globalAlpha = lerp(ghost, 1, e);
        c.fillStyle = mixColor(s.glyphGhost, s.glyphColor, e);
      }
      const x = gcx + (q.cx - gcx) * gs;
      const y = gcy + (q.cy - gcy) * gs;
      c.fillRect(x - half, y - half, half * 2, half * 2);
    });

    if (s.glow > 0 && gp > 0) {
      const pulse = Math.exp(-(((t - G.end) / (0.4 * T.k)) ** 2));
      const amt = s.glow * (0.22 * ease.outCubic(gp) + 0.7 * pulse) * fx.alpha;
      if (amt > 0.004) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, amt);
        ctx.filter = `blur(${Math.max(2, 16 * sc).toFixed(1)}px)`;
        ctx.drawImage(lc, 0, 0);
        ctx.restore();
      }
    }

    // Wordmark: letters slide in from the right with a shutter-style smear.
    c.globalCompositeOperation = 'lighter';
    const travel = 60;
    const offAt = (p) => (1 - ease.outExpo(clamp(p))) * travel;
    logo.letters.forEach((letter, j) => {
      const a0 = Wd.start + j * Wd.stagger;
      const p = progress(t, a0, a0 + Wd.dur);
      if (p <= 0) return;
      const off = offAt(p);
      const trail = (offAt(p - SHUTTER / Wd.dur) - off) * s.motionBlur;
      const alpha = clamp(p * 2.2);
      c.fillStyle = mixColor('#5a5a66', s.wordColor, ease.outCubic(clamp(p * 1.3)));
      const n = trail > 0.5 ? Math.min(14, 3 + Math.ceil(trail / 2.5)) : 1;
      for (let i = 0; i < n; i++) {
        const dx = off + (n > 1 ? (trail * i) / (n - 1) : 0);
        c.globalAlpha = alpha / n;
        c.setTransform(sc, 0, 0, sc, ox + dx * sc, oy);
        c.fill(letter.path, letter.rule);
      }
    });

    // Directional move blur, approximated with a velocity-scaled gaussian.
    let blur = fx.blur;
    if (M) {
      const h = 1 / 120;
      const v = Math.abs(moveEase(t + h) - moveEase(t - h)) / (2 * h);
      const dist = Math.abs(lg.y1 - lg.y0) + Math.abs(lg.s1 - lg.s0) * logo.bounds.w * 0.5;
      blur += Math.min(v * dist * SHUTTER * 0.07 * s.motionBlur, 10 * u);
    }
    ctx.save();
    ctx.globalAlpha = fx.alpha;
    if (blur > 0.3) ctx.filter = `blur(${blur.toFixed(2)}px)`;
    ctx.drawImage(lc, 0, 0);
    ctx.restore();
  }

  function drawTitle(ctx, t, fx) {
    const ti = L.title, TT = T.title;
    const grad = ctx.createLinearGradient(0, ti.top, 0, ti.bottom);
    grad.addColorStop(0, s.titleTop);
    grad.addColorStop(1, s.titleBottom);
    const accent = ctx.createLinearGradient(0, ti.top, 0, ti.bottom);
    accent.addColorStop(0, mixColor(s.accent, '#ffffff', 0.35));
    accent.addColorStop(1, s.accent);

    ctx.save();
    ctx.font = ti.font;
    ctx.letterSpacing = ti.tracking;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    for (const w of ti.words) {
      const a0 = TT.start + w.index * TT.stagger;
      const p = progress(t, a0, a0 + TT.dur);
      if (p <= 0) continue;
      const alpha = ease.outCubic(clamp(p * 1.6)) * fx.alpha;
      if (alpha <= 0.002) continue;
      const blur = (1 - ease.outCubic(p)) * 26 * u * s.blur + fx.blur;
      const dy = (1 - ease.outExpo(p)) * ti.size * 0.34 * s.rise + fx.lift;
      ctx.globalAlpha = alpha;
      ctx.filter = blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : 'none';
      ctx.fillStyle = w.accent ? accent : grad;
      ctx.setTransform(1, 0, 0, 1, 0, dy);
      ctx.fillText(w.text, w.x, w.baseline);
    }
    ctx.restore();
  }

  function drawSubtitle(ctx, t, fx) {
    const sb = L.sub, S = T.sub;
    const [lc, c] = layer('fx');
    const pad = 48 * u;
    sb.lines.forEach((ln, i) => {
      const a0 = S.start + i * S.stagger;
      const p = progress(t, a0, a0 + S.dur);
      if (p <= 0) return;
      const e = ease.outCubic(p);
      const rx = Math.max(0, Math.floor(ln.x - pad));
      const ry = Math.max(0, Math.floor(ln.baseline - sb.size * 1.2 - pad));
      const rw = Math.min(W - rx, Math.ceil(ln.w + pad * 2));
      const rh = Math.min(H - ry, Math.ceil(sb.size * 1.7 + pad * 2));

      c.globalCompositeOperation = 'source-over';
      c.clearRect(rx, ry, rw, rh);
      c.font = sb.font;
      c.letterSpacing = '0px';
      c.fillStyle = s.subtitleColor;
      c.fillText(ln.text, ln.x, ln.baseline + (1 - ease.outExpo(p)) * sb.size * 0.45 * s.rise);

      // Soft left-to-right wipe.
      const soft = 0.45;
      const r = lerp(-soft, 1, e);
      const g = c.createLinearGradient(ln.x + r * ln.w, 0, ln.x + (r + soft) * ln.w, 0);
      g.addColorStop(0, '#000');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalCompositeOperation = 'destination-in';
      c.fillStyle = g;
      c.fillRect(rx, ry, rw, rh);

      const blur = (1 - e) * 6 * u * s.blur + fx.blur;
      ctx.save();
      ctx.globalAlpha = fx.alpha;
      if (blur > 0.3) ctx.filter = `blur(${blur.toFixed(2)}px)`;
      ctx.drawImage(lc, rx, ry, rw, rh, rx, ry + fx.lift, rw, rh);
      ctx.restore();
    });
  }

  function drawUrl(ctx, t, fx) {
    const ul = L.url;
    const p = progress(t, T.url.start, T.url.end);
    if (p <= 0) return;
    const e = ease.outExpo(p);
    const dy = (1 - e) * 16 * u * s.rise + fx.lift;
    const blur = (1 - ease.outCubic(p)) * 10 * u * s.blur + fx.blur;

    ctx.save();
    if (blur > 0.3) ctx.filter = `blur(${blur.toFixed(2)}px)`;
    ctx.translate(0, dy);
    let textX = ul.x;
    if (ul.pill) {
      // The pill grows out from its centre, then the label fades in.
      const w = lerp(ul.h, ul.w, e);
      const x = W / 2 - w / 2;
      ctx.globalAlpha = ease.outCubic(clamp(p * 2)) * fx.alpha;
      ctx.beginPath();
      ctx.roundRect(x, ul.y, w, ul.h, ul.h / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.055)';
      ctx.fill();
      ctx.lineWidth = Math.max(1, 1.5 * u);
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.stroke();
      ctx.save();
      ctx.clip();
      const dotX = ul.x + ul.padX;
      ctx.globalAlpha = ease.outCubic(clamp((p - 0.12) * 2.2)) * fx.alpha;
      ctx.fillStyle = s.glyphColor;
      ctx.fillRect(dotX, ul.y + ul.h / 2 - ul.dot / 2, ul.dot, ul.dot);
      textX = dotX + ul.dot + ul.gap;
      ctx.font = ul.font;
      ctx.letterSpacing = ul.tracking;
      ctx.fillStyle = s.urlColor;
      ctx.globalAlpha = ease.outCubic(clamp((p - 0.18) * 2)) * fx.alpha;
      ctx.fillText(ul.text, textX, ul.baseline);
      ctx.restore();
    } else {
      ctx.globalAlpha = ease.outCubic(clamp(p * 1.6)) * fx.alpha;
      ctx.font = ul.font;
      ctx.letterSpacing = ul.tracking;
      ctx.fillStyle = s.urlColor;
      ctx.fillText(ul.text, textX, ul.baseline);
    }
    ctx.restore();
  }

  function drawGrain(ctx, t) {
    if (s.grain <= 0) return;
    const f = Math.floor(t * 24);
    const pat = ctx.createPattern(grain[f % grain.length], 'repeat');
    const k = Math.max(1, Math.round(u));
    pat.setTransform(new DOMMatrix([k, 0, 0, k, hash(f) * 256, hash(f + 99) * 256]));
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = s.grain;
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  return { prepare, render, setBackground };
}

import { hexToRgb } from './easing.js';
import { createMascotRenderer, INK, FACE } from './mascot.js';

// Transparent downloads of a mascot clip, for laying over other video: an
// animated GIF (its on/off transparency is exact for pixel art, so nothing is
// lost) and a Lottie JSON (vector, any size). Both are built from the
// renderer's rectangles, one image per change on screen, so files stay small
// and timing matches the MP4.

const GIF_MAX = 1080; // GIFs are capped to this on the short edge
const abortError = () => new DOMException('Export cancelled', 'AbortError');
const nextTick = () => new Promise((r) => setTimeout(r, 0));

// The clip as runs of identical frames, sampled `rate` times a second:
// [{ ops, start, end }] with start/end in samples. (The local MOV export,
// render/mov.mjs, uses it too.)
export function stillsOf(renderer, duration, rate) {
  const out = [];
  const n = Math.max(1, Math.round(duration * rate));
  for (let i = 0; i < n; i++) {
    const ops = renderer.scene((i + 0.5) / rate);
    const key = ops.join(';');
    const last = out.at(-1);
    if (last?.key === key) last.end = i + 1;
    else out.push({ key, ops, start: i, end: i + 1 });
  }
  return out;
}

// ---------------------------------------------------------------------- GIF

class Bytes {
  constructor() { this.buf = new Uint8Array(1 << 16); this.n = 0; }
  push(...bytes) { for (const b of bytes) this.byte(b); }
  byte(b) {
    if (this.n === this.buf.length) { const next = new Uint8Array(this.buf.length * 2); next.set(this.buf); this.buf = next; }
    this.buf[this.n++] = b;
  }
  word(v) { this.byte(v & 255); this.byte((v >> 8) & 255); }
  text(s) { for (const ch of s) this.byte(ch.charCodeAt(0)); }
  get bytes() { return this.buf.subarray(0, this.n); }
}

// GIF's variable-width LZW, written out in sub-blocks of up to 255 bytes.
function writeLzw(out, pixels, minCodeSize) {
  const clear = 1 << minCodeSize, eoi = clear + 1;
  let next = eoi + 1, size = minCodeSize + 1;
  let table = new Map();
  let cur = 0, bits = 0;
  const block = [];
  const flush = () => { out.byte(block.length); for (const b of block) out.byte(b); block.length = 0; };
  const emit = (code) => {
    cur |= code << bits;
    bits += size;
    while (bits >= 8) {
      block.push(cur & 255);
      if (block.length === 255) flush();
      cur >>>= 8;
      bits -= 8;
    }
  };
  out.byte(minCodeSize);
  emit(clear);
  let prefix = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    const key = (prefix << 8) | k;
    const code = table.get(key);
    if (code !== undefined) { prefix = code; continue; }
    emit(prefix);
    if (next === 4096) {
      emit(clear);
      table = new Map();
      next = eoi + 1;
      size = minCodeSize + 1;
    } else {
      if (next >= 1 << size) size++;
      table.set(key, next++);
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) block.push(cur & 255);
  if (block.length) flush();
  out.byte(0);
}

/**
 * Animated GIF with a transparent background, looping forever. Each frame
 * only covers what's drawn and clears back to transparent before the next
 * (disposal 2), so nothing smears. Resolves to { blob, width, height, frames }.
 */
export async function mascotGif(settings, width, height, { onProgress, signal } = {}) {
  const k = Math.min(1, GIF_MAX / Math.min(width, height));
  const W = Math.round(width * k), H = Math.round(height * k);
  const renderer = createMascotRenderer();
  const { duration } = renderer.prepare(settings, W, H);
  const { ink, face } = renderer.colors;
  // Delays are in 1/100 s, and browsers stretch anything under 2 to 10.
  const stills = [];
  for (const st of stillsOf(renderer, duration, 100)) {
    if (st.end - st.start < 2 && stills.length) stills.at(-1).end = st.end;
    else stills.push(st);
  }

  const out = new Bytes();
  out.text('GIF89a');
  out.word(W);
  out.word(H);
  out.push(0x91, 0, 0); // 4-colour global table, background index 0
  for (const hex of ['#000000', ink, face, '#000000']) out.push(...hexToRgb(hex)); // 0 is transparent
  out.push(0x21, 0xff, 11);
  out.text('NETSCAPE2.0');
  out.push(3, 1, 0, 0, 0); // loop forever

  for (const [n, st] of stills.entries()) {
    if (signal?.aborted) throw abortError();
    // Clip to the frame and crop to what's drawn.
    const rects = st.ops.map(([c, x, y, w, h]) => {
      const x0 = Math.max(0, x), y0 = Math.max(0, y);
      return [c, x0, y0, Math.min(W, x + w) - x0, Math.min(H, y + h) - y0];
    }).filter(([, , , w, h]) => w > 0 && h > 0);
    let [left, top, right, bottom] = [W, H, 0, 0];
    for (const [, x, y, w, h] of rects) {
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x + w); bottom = Math.max(bottom, y + h);
    }
    if (!rects.length) [left, top, right, bottom] = [0, 0, 1, 1];
    const fw = right - left, fh = bottom - top;
    const pixels = new Uint8Array(fw * fh);
    for (const [c, x, y, w, h] of rects) {
      const index = c === INK ? 1 : 2;
      for (let row = y - top; row < y - top + h; row++) pixels.fill(index, row * fw + x - left, row * fw + x - left + w);
    }

    out.push(0x21, 0xf9, 4, 0x09); // graphic control: disposal 2, transparent index
    out.word(st.end - st.start);
    out.push(0, 0);
    out.byte(0x2c);
    out.word(left);
    out.word(top);
    out.word(fw);
    out.word(fh);
    out.byte(0);
    writeLzw(out, pixels, 2);
    onProgress?.((n + 1) / stills.length);
    await nextTick();
  }
  out.byte(0x3b);
  return { blob: new Blob([out.bytes], { type: 'image/gif' }), width: W, height: H, frames: stills.length };
}

// ------------------------------------------------------------------- Lottie

const still = (k) => ({ a: 0, k });
const TRANSFORM = { o: still(100), r: still(0), p: still([0, 0, 0]), a: still([0, 0, 0]), s: still([100, 100, 100]) };
const GROUP_TRANSFORM = { ty: 'tr', p: still([0, 0]), a: still([0, 0]), s: still([100, 100]), r: still(0), o: still(100), sk: still(0), sa: still(0) };

// One frame's rectangles as a shape layer: a group per run of one colour, in
// reverse, because Lottie draws the first item on top.
function shapeLayer(ops, colors, op) {
  const groups = [];
  for (const [c, x, y, w, h] of ops) {
    if (groups.at(-1)?.c !== c) groups.push({ c, it: [] });
    groups.at(-1).it.push({ ty: 'rc', d: 1, p: still([x + w / 2, y + h / 2]), s: still([w, h]), r: still(0) });
  }
  const shapes = groups.reverse().map(({ c, it }) => ({
    ty: 'gr',
    it: [...it, { ty: 'fl', c: still([...hexToRgb(colors[c]).map((v) => v / 255), 1]), o: still(100), r: 1 }, GROUP_TRANSFORM],
  }));
  return { ddd: 0, ind: 1, ty: 4, sr: 1, ks: TRANSFORM, ao: 0, shapes, ip: 0, op, st: 0, bm: 0 };
}

/**
 * Lottie JSON with no background, at the project's frame rate. Frames that
 * repeat (every loop of the reaction) share one precomp. Resolves to
 * { blob, width, height, frames }.
 */
export function mascotLottie(settings, width, height) {
  const renderer = createMascotRenderer();
  const { duration } = renderer.prepare(settings, width, height);
  const { ink, face } = renderer.colors;
  const colors = { [INK]: ink, [FACE]: face };
  const fps = settings.fps;
  const stills = stillsOf(renderer, duration, fps);
  const op = stills.at(-1).end;
  const assets = [], ids = new Map();
  const layers = stills.filter((st) => st.ops.length).map((st, i) => {
    if (!ids.has(st.key)) {
      ids.set(st.key, `frame${ids.size}`);
      assets.push({ id: ids.get(st.key), layers: [shapeLayer(st.ops, colors, op)] });
    }
    return { ddd: 0, ind: i + 1, ty: 0, refId: ids.get(st.key), sr: 1, ks: TRANSFORM, ao: 0, w: width, h: height, ip: st.start, op: st.end, st: 0, bm: 0 };
  });
  const json = { v: '5.7.4', fr: fps, ip: 0, op, w: width, h: height, nm: `Uploadcare mascot · ${settings.mascotReaction}`, ddd: 0, assets, layers };
  const blob = new Blob([JSON.stringify(json)], { type: 'application/json' });
  return { blob, width, height, frames: assets.length };
}

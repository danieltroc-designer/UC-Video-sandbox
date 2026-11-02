#!/usr/bin/env node
/**
 * Renders Library cards to MP4 — frame-exact, in headless Chrome.
 *
 * The decks are live DOM animations, so a frame is whatever Chrome paints at a
 * given moment. The page's clock is replaced (render/clock.js) so time only
 * moves when we step it: advance exactly 1/fps, screenshot, repeat. Every frame
 * is the animation at precisely i/fps seconds, however long the screenshot
 * takes. A second tab (render/encoder.html) encodes them to H.264 with
 * WebCodecs, the same encoder the app's own export uses.
 *
 *   node render/render.mjs --deck ecommerce-expo --card 1
 *   node render/render.mjs --deck webflow-booth --all --format all --scale 2
 *
 * Options: --card N (1-based) | --label "text" (a card whose label has it) | --all,
 * --format landscape|portrait|square|all,
 * --fps 30, --scale 1|2 (2 = 4K-class), --out <dir> (default ~/Downloads),
 * --camera (the Camera look), --no-text (a Shots card's animation-only version).
 *
 * Layout checks: --stills 0.5,2,5 renders those moments (seconds) into one
 * labelled contact-sheet PNG instead of a video.
 */
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installClock } from './clock.js';
import { serve } from '../server.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// a deck is any library/<name>/ folder with a built deck.html (checked per call, so a new deck needs no restart)
export const isDeck = (name) => /^[a-z0-9-]+$/.test(name) && existsSync(join(ROOT, 'library', name, 'deck.html'));
export const FORMATS = { landscape: [1920, 1080], portrait: [1080, 1920], square: [1080, 1080] };

/** Newest headless Chrome already on this machine (Puppeteer or Playwright cache). */
export function findChrome() {
  if (process.env.UC_CHROME && existsSync(process.env.UC_CHROME)) return process.env.UC_CHROME;
  const candidates = [];
  const scan = (dir, match, bin) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) if (match.test(name)) {
      for (const arch of ['mac-arm64', 'mac-x64', 'linux64']) candidates.push({ name, path: join(dir, name, `chrome-headless-shell-${arch}`, bin) });
    }
  };
  scan(join(homedir(), '.cache/puppeteer/chrome-headless-shell'), /\d/, 'chrome-headless-shell');
  for (const cache of ['.cache/ms-playwright-stable', '.cache/ms-playwright', 'Library/Caches/ms-playwright']) {
    scan(join(homedir(), cache), /^chromium_headless_shell-/, 'chrome-headless-shell');
  }
  const found = candidates.filter((c) => existsSync(c.path))
    .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
  if (!found.length) {
    throw new Error('No headless Chrome found. Install one with:\n  npx @puppeteer/browsers install chrome-headless-shell@stable --path ~/.cache/puppeteer');
  }
  return found[0].path;
}

export function launch() {
  return puppeteer.launch({
    executablePath: findChrome(),
    headless: 'shell',
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--disable-lcd-text', '--mute-audio'],
  });
}

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/**
 * Renders one card. `card` is 0-based. Pass `baseUrl` and `browser` to reuse
 * an existing server and Chrome (the local API does); otherwise both are
 * started and torn down here.
 */
export async function renderCard({
  deck, card, format = 'landscape', fps = 30, scale = 1, out = join(homedir(), 'Downloads'),
  baseUrl, browser: sharedBrowser, onProgress = () => {}, onStatus = () => {}, signal, stills, camera = false, label,
  text = true,
}) {
  if (!isDeck(deck)) throw new Error(`Unknown deck "${deck}"`);
  if (!FORMATS[format]) throw new Error(`Unknown format "${format}"`);
  const width = FORMATS[format][0] * scale;
  const height = FORMATS[format][1] * scale;

  const server = baseUrl ? null : await serve(ROOT, 0);
  baseUrl ??= `http://localhost:${server.address().port}`;
  const browser = sharedBrowser ?? await launch();
  const page = await browser.newPage();
  const enc = await browser.newPage();
  try {
    onStatus('Loading card');
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(installClock, 1);
    const cdp = await page.createCDPSession();
    // a desktop with a mouse: filmed web pages keep their hover styles and handlers
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'hover', value: 'hover' }, { name: 'any-hover', value: 'hover' }, { name: 'pointer', value: 'fine' }],
    });
    const net = watchNetwork(page);
    // camera: the card plays in its 16:9 layout inside library/camera.html, filmed in perspective
    // text: false plays a Shots card's animation-only version, where it has one
    const extra = text ? '' : '&text=0';
    const url = () => camera
      ? `${baseUrl}/library/camera.html?deck=${deck}&card=${card}&format=${format}&hold${extra}`
      : `${baseUrl}/library/${deck}/deck.html?card=${card}&format=${format}&hold${extra}`;
    await page.goto(url(), { waitUntil: 'load' });
    // by label: look it up in the deck as loaded (its card list may have changed since the caller looked)
    const found = label && await page.evaluate((l) => window.__deckInfo().findIndex((c) => c.label.toLowerCase().includes(l)), label.toLowerCase());
    if (label && found < 0) throw new Error(`No card labelled "${label}" in ${deck}`);
    if (label && found !== card) { card = found; await page.goto(url(), { waitUntil: 'load' }); }
    if (camera) await page.waitForFunction(() => window.__cameraReady, { timeout: 20000 });
    const info = await page.evaluate((i) => window.__deckInfo()[i], card);
    if (!info) throw new Error(`${deck} has no card ${card + 1}`);
    // the camera films the card's 16:9 layout, whatever shape the film is
    const needs = camera ? 'landscape' : format;
    if (!info.formats.includes(needs)) throw new Error(`${info.label} has no ${needs} layout${camera ? ' to film' : ''}`);

    // Build the card with the clock still at 0, and let its images arrive
    // before the first frame — time doesn't move while we wait.
    await page.evaluate(() => document.fonts.ready.then(() => window.__deckStart()));
    await page.waitForNetworkIdle({ idleTime: 300, timeout: 20000 }).catch(() => {});
    for (const f of page.frames()) {
      // loaded images only: a lazy one off-screen never loads, and its decode() never settles
      await f.evaluate(async () => {
        await Promise.all([...document.images].filter((img) => img.complete).map((img) => img.decode().catch(() => {})));
        await document.fonts.ready;
      }).catch(() => {});
    }

    await enc.goto(`${baseUrl}/render/encoder.html`, { waitUntil: 'load' });
    await enc.waitForFunction(() => window.encoderReady);

    if (stills) return await contactSheet({ page, net, enc, deck, card, format, info, stills, out, width, height, camera, plain: !text && info.plain });
    const method = await enc.evaluate((o) => window.startEncoder(o), { width, height, fps, bitsPerPixel: camera ? 0.38 : 0.18 });

    const frames = Math.max(1, Math.round(info.duration * fps));
    const inflight = [];
    onStatus(`Rendering ${frames} frames`);
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw new Error('Render cancelled');
      await advance(page, (i * 1000) / fps);
      await net.settle();
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
      // Capture the next frame while this one encodes (the tab encodes in order).
      inflight.push(enc.evaluate((b64, idx) => window.encodeFrame(b64, idx), data, i));
      if (inflight.length > 2) await inflight.shift();
      onProgress((i + 1) / frames);
    }
    await Promise.all(inflight);
    onStatus('Finishing MP4');
    const bytes = Buffer.from(await enc.evaluate((n) => window.finishEncoder(n), frames), 'base64');

    const plain = !text && info.plain ? '-no-text' : '';
    const name = `uc-${deck}-${String(card + 1).padStart(2, '0')}-${slug(info.label.replace(/^Expo · /, ''))}${plain}${camera ? '-camera' : ''}-${width}x${height}.mp4`;
    mkdirSync(out, { recursive: true });
    const file = join(out, name);
    writeFileSync(file, bytes);
    return { file, name, bytes: bytes.length, frames, fps, duration: frames / fps, width, height, method, card: info };
  } finally {
    await page.close().catch(() => {});
    await enc.close().catch(() => {});
    if (!sharedBrowser) await browser.close();
    server?.close();
  }
}

/**
 * Requests in flight, and a wait for them. Filmed web pages fetch images
 * mid-animation (some built from URL API transforms) and seek their videos
 * (render/clock.js); time doesn't move while we wait, so a frame never shows
 * one half-loaded.
 */
function watchNetwork(page) {
  let pending = 0;
  page.on('request', () => { pending++; });
  page.on('requestfinished', () => { pending--; });
  page.on('requestfailed', () => { pending--; });
  return {
    async settle(timeout = 8000) {
      const until = Date.now() + timeout;
      const busy = async () => pending > 0 || (await Promise.all(page.frames().map((f) =>
        f.evaluate(() => !!window.__vt?.mediaBusy?.()).catch(() => false)))).some(Boolean);
      // a seeked video fetches its segment the same way
      while (Date.now() < until && await busy()) await new Promise((r) => setTimeout(r, 15));
      // …and decoded, or the screenshot can catch an empty box
      for (const f of page.frames()) {
        await f.evaluate(() => Promise.all([...document.images]
          .filter((img) => img.complete && img.naturalWidth && !img.__ucDecoded)
          .map((img) => { img.__ucDecoded = true; return img.decode().catch(() => {}); }))).catch(() => {});
      }
    },
  };
}

/** Moves every frame's clock (the deck, and the camera page around it) to `ms`. */
async function advance(page, ms) {
  for (const f of page.frames()) {
    await f.evaluate((t) => window.__vt && window.__vt.advance(t - window.__vt.now), ms).catch(() => {});
  }
}

/** Renders `stills` (seconds) and tiles them into one labelled PNG. */
async function contactSheet({ page, net, enc, deck, card, format, info, stills, out, width, height, camera, plain }) {
  const shots = [];
  // step through at 30 fps, as a video would: a cursor's hovers on the way there count
  let now = 0;
  for (const t of stills) {
    for (const end = Math.max(0, t * 1000); now < end;) {
      now = Math.min(end, now + 1000 / 30);
      await advance(page, now);
    }
    await net.settle();
    shots.push((await page.screenshot({ type: 'png', encoding: 'base64' })));
  }
  const cols = format === 'portrait' ? Math.min(5, stills.length) : format === 'square' ? Math.min(4, stills.length) : Math.min(3, stills.length);
  const png = await enc.evaluate(async ({ shots, stills, cols, width, height }) => {
    const tileW = cols >= 4 ? 420 : 600;
    const tileH = Math.round((tileW * height) / width);
    const rows = Math.ceil(shots.length / cols);
    const c = Object.assign(document.createElement('canvas'), { width: cols * tileW + (cols + 1) * 8, height: rows * tileH + (rows + 1) * 8 });
    const x = c.getContext('2d');
    x.fillStyle = '#333';
    x.fillRect(0, 0, c.width, c.height);
    for (const [i, b64] of shots.entries()) {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const px = 8 + (i % cols) * (tileW + 8), py = 8 + Math.floor(i / cols) * (tileH + 8);
      x.drawImage(img, px, py, tileW, tileH);
      x.fillStyle = 'rgba(0,0,0,.7)';
      x.fillRect(px, py, 64, 22);
      x.fillStyle = '#fff';
      x.font = '600 14px sans-serif';
      x.fillText(`${stills[i].toFixed(2)}s`, px + 7, py + 16);
    }
    return c.toDataURL('image/png').split(',')[1];
  }, { shots, stills, cols, width, height });
  mkdirSync(out, { recursive: true });
  const file = join(out, `sheet-${deck}-${String(card + 1).padStart(2, '0')}-${format}${plain ? '-no-text' : ''}${camera ? '-camera' : ''}.png`);
  writeFileSync(file, Buffer.from(png, 'base64'));
  return { file, name: file.split('/').pop(), card: info };
}

// ------------------------------------------------------------------- CLI

async function cli(argv) {
  const opt = { format: 'landscape', fps: 30, scale: 1, out: join(homedir(), 'Downloads') };
  for (let i = 0; i < argv.length; i++) {
    const [k, v] = [argv[i].replace(/^--/, ''), argv[i + 1]];
    if (k === 'all') opt.all = true;
    else if (k === 'camera') opt.camera = true;
    else if (k === 'no-text') opt.noText = true;
    else { opt[k] = v; i++; }
  }
  if (!opt.deck) throw new Error('Usage: node render/render.mjs --deck <deck> (--card N | --label text | --all) [--format landscape|portrait|square|all] [--fps 30] [--scale 1|2] [--out dir]');
  const formats = opt.format === 'all' ? Object.keys(FORMATS) : [opt.format];
  const server = await serve(ROOT, 0);
  const baseUrl = `http://localhost:${server.address().port}`;
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/library/${opt.deck}/deck.html?card=0&hold`);
    const info = await page.evaluate(() => window.__deckInfo());
    await page.close();
    const byLabel = opt.label && info.find((c) => c.label.toLowerCase().includes(String(opt.label).toLowerCase()));
    if (opt.label && !byLabel) throw new Error(`No card labelled "${opt.label}" in ${opt.deck}`);
    const cards = opt.all ? info.map((c) => c.index) : byLabel ? [byLabel.index] : [Number(opt.card) - 1];
    for (const card of cards) for (const format of formats) {
      // --format all: only the shapes this card has
      const has = info[card]?.formats.includes(opt.camera ? 'landscape' : format);
      if (formats.length > 1 && !has) continue;
      const t0 = Date.now();
      let last = -1;
      const stills = opt.stills ? String(opt.stills).split(',').map(Number) : undefined;
      const r = await renderCard({
        deck: opt.deck, card, format, fps: Number(opt.fps), scale: Number(opt.scale), out: resolve(opt.out),
        baseUrl, browser, stills, camera: !!opt.camera, label: byLabel ? String(opt.label) : undefined, text: !opt.noText,
        onProgress: (p) => { const pct = Math.floor(p * 10); if (pct !== last) { last = pct; process.stdout.write(`\r  card ${card + 1} ${format}: ${pct * 10}%`); } },
      });
      if (stills) { console.log(`  ${r.file}`); continue; }
      console.log(`\r  ${r.name}  ${r.width}x${r.height} · ${r.duration.toFixed(2)}s · ${(r.bytes / 1e6).toFixed(1)} MB · ${r.method} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv.slice(2)).catch((err) => { console.error(`\n${err.message}`); process.exit(1); });
}

#!/usr/bin/env node
/**
 * Landscape regression check for the Library decks.
 *
 * Recomposing cards for portrait and square must leave the original 16:9
 * cards untouched. Renders are frame-exact and seeded, so an untouched card
 * renders identically every time — this compares contact sheets of every
 * card against a saved baseline, pixel for pixel.
 *
 *   node render/regress.mjs --deck ecommerce-expo --save   # record baseline
 *   node render/regress.mjs --deck ecommerce-expo          # compare
 */
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, renderCard } from './render.mjs';
import { serve } from '../server.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const deck = args[args.indexOf('--deck') + 1];
const save = args.includes('--save');
const dir = join(ROOT, 'render', '_baseline', deck);
const tmp = join(ROOT, 'render', '_out', 'regress');
mkdirSync(dir, { recursive: true });

const server = await serve(ROOT, 0);
const baseUrl = `http://localhost:${server.address().port}`;
const browser = await launch();
let failed = 0;
try {
  const probe = await browser.newPage();
  await probe.goto(`${baseUrl}/library/${deck}/deck.html?card=0&hold`);
  const cards = await probe.evaluate(() => window.__deckInfo());
  for (const c of cards) {
    const d = c.duration;
    const stills = [0.3, d * 0.25, d * 0.5, d * 0.75, d - 0.05].map((t) => Math.round(t * 100) / 100);
    const r = await renderCard({ deck, card: c.index, format: 'landscape', stills, out: tmp, baseUrl, browser });
    const base = join(dir, r.name);
    if (save) {
      renameSync(r.file, base);
      console.log(`  saved  ${String(c.index + 1).padStart(2, '0')} ${c.label}`);
      continue;
    }
    if (!existsSync(base)) { console.log(`  ?      ${c.label}: no baseline`); continue; }
    const diff = await probe.evaluate(async (a, b) => {
      const load = async (b64) => {
        const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const cv = new OffscreenCanvas(bmp.width, bmp.height);
        const x = cv.getContext('2d');
        x.drawImage(bmp, 0, 0);
        return x.getImageData(0, 0, bmp.width, bmp.height);
      };
      const [A, B] = await Promise.all([load(a), load(b)]);
      if (A.width !== B.width || A.height !== B.height) return { size: true };
      let changed = 0;
      for (let i = 0; i < A.data.length; i += 4) {
        if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) > 24) changed++;
      }
      return { changed, pct: (changed / (A.data.length / 4)) * 100 };
    }, readFileSync(base).toString('base64'), readFileSync(r.file).toString('base64'));
    // a few dozen pixels of antialiasing noise can differ between runs; a real
    // layout change moves far more than 0.02% of a sheet
    const ok = !diff.size && diff.pct < 0.02;
    if (!ok) failed++;
    console.log(`  ${ok ? 'same   ' : 'CHANGED'} ${String(c.index + 1).padStart(2, '0')} ${c.label}${ok ? '' : `: ${diff.size ? 'size differs' : `${diff.pct.toFixed(3)}% of pixels`} (see ${r.file})`}`);
  }
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.log(`\n${failed} card(s) changed in landscape.`); process.exit(1); }

#!/usr/bin/env node
/**
 * Mirrors the uploadcare.com pages the Shots deck films into library/shots/site/.
 *
 * The pages are Astro builds: static HTML plus /_astro/ scripts, styles and
 * fonts. Those are copied here and pointed at the copy, so a shot loads from
 * our own origin, where the renderer's virtual clock and the scripted cursor
 * can reach inside it. Images stay on Uploadcare's CDN (some are built from
 * URL API transforms at runtime); the renderer waits for them frame by frame.
 *
 * Analytics, the cookie banner, chat, error reporting and the live status
 * badge are left out. `:hover` rules also match `.uc-hover`, so the shot
 * player can hover things without a real mouse.
 *
 *   node library/shots/mirror.mjs     # refresh from the live site
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'site');
const ORIGIN = 'https://uploadcare.com';
const PREFIX = '/library/shots/site/';
export const PAGES = {
  home: '/',
  'file-uploader': '/products/file-uploader/',
  'image-cdn': '/cdn/image-cdn/',
  'video-cdn': '/cdn/video-cdn/',
  pricing: '/pricing/',
};

const THIRD_PARTY = /googletagmanager|gtag\(|dataLayer|rewardful|cookiehub|spara|wdfl|Rollbar|status\.uploadcare|Fully operational/;

// `:hover` → `:is(:hover,.uc-hover)`, leaving `(hover: hover)` media features alone
const hoverable = (css) => css
  .replace(/\((any-)?hover:\s*hover\)/g, (m) => m.replace('hover', '\u0000'))
  .replace(/:hover\b/g, ':is(:hover,.uc-hover)')
  .replace(/\u0000/g, 'hover');

const toLocal = (text) => text
  .replaceAll(`${ORIGIN}/_astro/`, `${PREFIX}_astro/`)
  .replace(/(^|[^\w.\/-])\/_astro\//g, `$1${PREFIX}_astro/`);

const queue = new Set();
const done = new Set();
const want = (name) => { if (!done.has(name)) queue.add(name); };

// every /_astro/ file a text asset refers to, directly or relative to itself
function collect(text) {
  for (const m of text.matchAll(/\/_astro\/([\w.@%-]+\.\w+)/g)) want(m[1]);
  for (const m of text.matchAll(/["'`(]\.\/([\w.@%-]+\.(?:js|css|woff2?|svg|png|webp|jpg|avif|json))/g)) want(m[1]);
  for (const m of text.matchAll(/["'`]_astro\/([\w.@%-]+\.\w+)/g)) want(m[1]);
}

async function get(url, binary = false) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return binary ? Buffer.from(await r.arrayBuffer()) : r.text();
}

function cleanPage(html) {
  html = html
    // third-party and live-data scripts, inline or not
    .replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g, (all, attrs, body) => {
      const src = attrs.match(/\bsrc="([^"]+)"/)?.[1];
      if (src && !src.startsWith('/_astro/')) return '';
      if (THIRD_PARTY.test(attrs) || THIRD_PARTY.test(body)) return '';
      return all;
    })
    .replace(/<link\b[^>]*(cookiehub|preconnect|dns-prefetch|manifest|apple-touch-icon|rel="icon")[^>]*>/g, '')
    .replace(/<noscript>[\s\S]*?<\/noscript>/g, '')
    .replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/g, (all, attrs, css) => `<style${attrs}>${hoverable(css)}</style>`);
  collect(html);
  return toLocal(html);
}

mkdirSync(join(OUT, '_astro'), { recursive: true });
for (const [name, path] of Object.entries(PAGES)) {
  const html = cleanPage(await get(ORIGIN + path));
  writeFileSync(join(OUT, `${name}.html`), html);
  console.log(`  ${name}.html  ${(html.length / 1024).toFixed(0)} KB`);
}

let bytes = 0;
while (queue.size) {
  const [file] = queue;
  queue.delete(file);
  done.add(file);
  const url = `${ORIGIN}/_astro/${file}`;
  const text = /\.(js|css|svg|json)$/.test(file);
  let body;
  try { body = await get(url, !text); } catch (err) { console.warn(`  skipped ${file}: ${err.message}`); continue; }
  if (text) {
    collect(body);
    if (file.endsWith('.css')) body = hoverable(body);
    body = toLocal(body);
    // Vite's preload helper builds root-absolute URLs at runtime
    if (file.startsWith('preload-helper')) body = body.replace('return`/`+e', `return\`${PREFIX}\`+e`);
  }
  writeFileSync(join(OUT, '_astro', file), body);
  bytes += body.length;
}
console.log(`  _astro/  ${done.size} files, ${(bytes / 1e6).toFixed(1)} MB`);

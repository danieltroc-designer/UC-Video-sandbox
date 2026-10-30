/**
 * Local render API, mounted by server.mjs under /api (only when the studio
 * runs on your machine — the static Vercel site has no API, and the Library
 * shows how to export locally instead).
 *
 *   GET  /api/health              -> { render: true, chrome }
 *   POST /api/render  {deck, card, format, fps, scale}  -> { id }
 *   GET  /api/render/:id          -> { state, progress, status, result | error }
 *   GET  /api/render/:id/file     -> the MP4 (also saved to ~/Downloads)
 *   DELETE /api/render/:id        -> cancel
 *
 * Jobs run one at a time on a shared headless Chrome.
 */
import { createReadStream, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DECKS, FORMATS, findChrome, launch, renderCard } from './render.mjs';

const OUT = join(homedir(), 'Downloads');
const jobs = new Map();
let queue = Promise.resolve();
let browser = null;

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

const readBody = (req) => new Promise((ok, fail) => {
  let data = '';
  req.on('data', (c) => { data += c; if (data.length > 1e5) req.destroy(); });
  req.on('end', () => { try { ok(JSON.parse(data || '{}')); } catch (e) { fail(e); } });
  req.on('error', fail);
});

async function run(job, baseUrl) {
  if (job.state === 'cancelled') return;
  job.state = 'rendering';
  try {
    browser ??= await launch();
    if (!browser.connected) browser = await launch();
    job.result = await renderCard({
      ...job.request, out: OUT, baseUrl, browser, signal: job.controller.signal,
      onProgress: (p) => { job.progress = p; },
      onStatus: (s) => { job.status = s; },
    });
    job.state = 'done';
    job.progress = 1;
  } catch (err) {
    if (job.controller.signal.aborted) { job.state = 'cancelled'; return; }
    console.error(err);
    job.state = 'error';
    job.error = err.message;
  }
}

export async function handle(req, res, { baseUrl }) {
  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  if (parts[1] === 'health') {
    let chrome = null;
    try { chrome = findChrome(); } catch { /* reported as null */ }
    return json(res, 200, { render: true, chrome, out: OUT });
  }

  if (parts[1] !== 'render') return json(res, 404, { error: 'Not found' });

  if (req.method === 'POST' && parts.length === 2) {
    const body = await readBody(req);
    const request = {
      deck: String(body.deck),
      card: Math.trunc(Number(body.card)),
      format: String(body.format || 'landscape'),
      fps: [24, 25, 30, 50, 60].includes(Number(body.fps)) ? Number(body.fps) : 30,
      scale: Number(body.scale) === 2 ? 2 : 1,
    };
    if (!DECKS.includes(request.deck) || !FORMATS[request.format] || !(request.card >= 0)) {
      return json(res, 400, { error: 'Unknown deck, card or format' });
    }
    const job = { id: randomUUID(), request, state: 'queued', progress: 0, status: 'Queued', controller: new AbortController() };
    jobs.set(job.id, job);
    queue = queue.then(() => run(job, baseUrl));
    return json(res, 202, { id: job.id });
  }

  const job = jobs.get(parts[2]);
  if (!job) return json(res, 404, { error: 'No such job' });

  if (req.method === 'DELETE') {
    job.controller.abort();
    if (job.state === 'queued') job.state = 'cancelled';
    return json(res, 200, { id: job.id, state: job.state });
  }

  if (parts[3] === 'file') {
    if (job.state !== 'done') return json(res, 409, { error: 'Not finished' });
    const { file, name } = job.result;
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': statSync(file).size,
      'Content-Disposition': `attachment; filename="${name}"`,
    });
    return createReadStream(file).pipe(res);
  }

  const { id, state, progress, status, error, result } = job;
  return json(res, 200, { id, state, progress, status, error, result: result && { ...result, file: undefined } });
}

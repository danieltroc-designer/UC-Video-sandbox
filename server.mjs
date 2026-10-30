// Tiny dependency-free static server with Range support (needed for video seeking).
// Run directly it also serves the local render API (/api/*, see render/api.mjs),
// which is what lets the Library export cards; imported, it's just the static
// handler the renderer uses for its own private server.
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.json': 'application/json', '.mov': 'video/quicktime',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2',
};

export function staticHandler(rootDir) {
  const root = resolve(rootDir);
  return (req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    let stat;
    try { stat = statSync(file); } catch { res.writeHead(404).end('Not found'); return; }
    if (stat.isDirectory()) { res.writeHead(302, { Location: path + '/' }).end(); return; }
    const headers = {
      'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
      'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache',
    };
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Number(range[2]) : stat.size - 1;
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
      createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { ...headers, 'Content-Length': stat.size });
      createReadStream(file).pipe(res);
    }
  };
}

/** Static server on `port` (0 = any free port); resolves once listening. */
export function serve(rootDir, port = 0, handler = staticHandler(rootDir)) {
  return new Promise((ok) => {
    const server = createServer(handler).listen(port, () => ok(server));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(process.argv[2] || '.');
  const port = Number(process.env.PORT || process.argv[3] || 5173);
  const files = staticHandler(root);
  let api = null;
  const server = await serve(root, port, async (req, res) => {
    if (!req.url.startsWith('/api/')) return files(req, res);
    try {
      api ??= await import('./render/api.mjs');
      await api.handle(req, res, { root, baseUrl: `http://localhost:${port}` });
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
  console.log(`Serving ${root} at http://localhost:${server.address().port}`);
}

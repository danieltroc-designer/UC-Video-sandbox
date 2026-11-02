/**
 * Transparent mascot MOVs (ProRes 4444 or HEVC with alpha) for video editors.
 * The mascot's frames come from the studio's own renderer (src/mascot.js runs
 * fine in Node: it only produces rectangles), and render/movwriter.swift
 * encodes them through AVFoundation, so this is macOS-only, like the rest of
 * the local renderer. The Swift tool is compiled on first use.
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { hexToRgb } from '../src/easing.js';
import { createMascotRenderer, INK, FACE } from '../src/mascot.js';
import { stillsOf } from '../src/mascot-export.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, 'movwriter.swift');
const BIN = join(HERE, '_bin', 'movwriter');
export const MOV_CODECS = { prores: 'ProRes 4444', hevc: 'HEVC with alpha' };

let building = null;

// Compile movwriter when it's missing or older than its source. The default
// SDK can be newer than the installed compiler, so fall back to the others.
function buildWriter(onStatus) {
  if (existsSync(BIN) && statSync(BIN).mtimeMs >= statSync(SOURCE).mtimeMs) return Promise.resolve(BIN);
  building ??= (async () => {
    onStatus?.('Building the MOV writer (first time only)…');
    mkdirSync(dirname(BIN), { recursive: true });
    const sdkDir = '/Library/Developer/CommandLineTools/SDKs';
    const sdks = existsSync(sdkDir)
      ? readdirSync(sdkDir).filter((d) => /^MacOSX\d/.test(d)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      : [];
    let lastError = null;
    for (const sdk of [null, ...sdks]) {
      try {
        await promisify(execFile)('swiftc', ['-O', ...(sdk ? ['-sdk', join(sdkDir, sdk)] : []), SOURCE, '-o', BIN]);
        return BIN;
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(`Couldn't build the MOV writer (needs Xcode or the Command Line Tools): ${String(lastError?.stderr || lastError?.message).split('\n').find(Boolean)}`);
  })().finally(() => { building = null; });
  return building;
}

/** Renders a Mascot-mode `settings` to `<out>/<name>.mov`; resolves to the file's details. */
export async function writeMascotMov({ settings, width, height, codec, out, signal, onProgress, onStatus }) {
  const bin = await buildWriter(onStatus);
  const renderer = createMascotRenderer();
  const { duration } = renderer.prepare(settings, width, height);
  const fps = settings.fps;
  const stills = stillsOf(renderer, duration, fps);
  const { ink, face } = renderer.colors;
  const name = `uploadcare-mascot-${settings.mascotReaction}-${width}x${height}-${codec === 'hevc' ? 'hevc' : 'prores'}.mov`;
  mkdirSync(out, { recursive: true });
  const file = join(out, name);
  const manifest = join(tmpdir(), `uc-mascot-${process.pid}-${Date.now()}.json`);
  writeFileSync(manifest, JSON.stringify({
    width, height, fps, codec, out: file,
    colors: { [INK]: hexToRgb(ink), [FACE]: hexToRgb(face) },
    stills: stills.map(({ start, end, ops }) => ({ start, end, rects: ops })),
  }));

  onStatus?.(`Encoding ${MOV_CODECS[codec]}`);
  try {
    await new Promise((ok, fail) => {
      const child = spawn(bin, [manifest]);
      let err = '';
      const abort = () => child.kill();
      signal?.addEventListener('abort', abort, { once: true });
      child.stdout.on('data', (chunk) => {
        for (const line of String(chunk).split('\n')) {
          const m = /^progress (\d+) (\d+)/.exec(line);
          if (m) onProgress?.(Number(m[1]) / Number(m[2]));
        }
      });
      child.stderr.on('data', (chunk) => { err += chunk; });
      child.on('error', fail);
      child.on('close', (code) => {
        signal?.removeEventListener('abort', abort);
        if (signal?.aborted) fail(new Error('cancelled'));
        else if (code === 0) ok();
        else fail(new Error(err.trim().replace(/^movwriter: /, '') || `movwriter exited with ${code}`));
      });
    });
  } catch (err) {
    rmSync(file, { force: true });
    throw err;
  } finally {
    rmSync(manifest, { force: true });
  }
  return { file, name, bytes: statSync(file).size, width, height, fps, duration: stills.at(-1).end / fps, codec: MOV_CODECS[codec] };
}

// node render/mov.mjs --inspect clip.mov : read a MOV back and report its alpha.
if (process.argv[2] === '--inspect' && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bin = await buildWriter((s) => console.log(s));
  spawn(bin, ['--inspect', process.argv[3]], { stdio: 'inherit' });
}

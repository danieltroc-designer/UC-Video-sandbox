import { createRenderer } from './renderer.js';

const MUXER_URL = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/+esm';
// H.264 High profile, from level 5.2 down — first one the browser accepts wins.
const AVC_CODECS = ['avc1.640034', 'avc1.640033', 'avc1.64002a', 'avc1.640028', 'avc1.4d0034', 'avc1.42003e'];

const abortError = () => new DOMException('Export cancelled', 'AbortError');
const nextFrame = () => new Promise((r) => setTimeout(r, 0));

async function pickCodec(width, height, framerate, bitrate) {
  for (const codec of AVC_CODECS) {
    const config = { codec, width, height, framerate, bitrate, avc: { format: 'avc' } };
    try {
      const { supported } = await VideoEncoder.isConfigSupported(config);
      if (supported) return config;
    } catch { /* try the next one */ }
  }
  return null;
}

/**
 * Renders every frame offline (faster or slower than real time, never dropping
 * frames) and encodes to MP4 via WebCodecs. Falls back to a real-time
 * MediaRecorder capture where WebCodecs isn't available.
 */
export async function exportVideo({ settings, logo, background, width, height, fps, onProgress, signal }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  const renderer = createRenderer({ logo });
  renderer.setBackground(background);
  const { duration } = renderer.prepare(settings, width, height);
  const frames = Math.max(1, Math.round(duration * fps));
  const bitrate = Math.round(Math.min(80e6, Math.max(8e6, width * height * fps * 0.16)));

  const config = 'VideoEncoder' in window ? await pickCodec(width, height, fps, bitrate) : null;
  if (!config) return recordRealtime({ canvas, ctx, renderer, duration, fps, bitrate, onProgress, signal });

  const { Muxer, ArrayBufferTarget } = await import(MUXER_URL);
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: 'avc', width, height, frameRate: fps }, fastStart: 'in-memory' });
  let failure = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { failure = e; },
  });
  encoder.configure({ ...config, latencyMode: 'quality' });

  try {
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw abortError();
      if (failure) throw failure;
      renderer.render(ctx, i / fps);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 8) await nextFrame();
      if (i % 3 === 0) { onProgress?.(i / frames); await nextFrame(); }
    }
    await encoder.flush();
    if (failure) throw failure;
    muxer.finalize();
    onProgress?.(1);
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
}

async function recordRealtime({ canvas, ctx, renderer, duration, fps, bitrate, onProgress, signal }) {
  const type = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: bitrate });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));

  renderer.render(ctx, 0);
  rec.start();
  const t0 = performance.now();
  await new Promise((resolve, reject) => {
    const tick = () => {
      if (signal?.aborted) { rec.stop(); reject(abortError()); return; }
      const t = (performance.now() - t0) / 1000;
      renderer.render(ctx, Math.min(t, duration));
      onProgress?.(Math.min(1, t / duration));
      if (t >= duration) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  rec.stop();
  await stopped;
  stream.getTracks().forEach((tr) => tr.stop());
  return new Blob(chunks, { type: type.split(';')[0] });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

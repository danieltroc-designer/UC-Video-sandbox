import { createRenderer } from './renderer.js';

const MUXER_URL = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/+esm';

// H.264 levels as [level_idc, max macroblocks/s, max frame size in macroblocks].
const AVC_LEVELS = [
  [0x28, 245760, 8192], // 4.0
  [0x2a, 522240, 8704], // 4.2
  [0x32, 589824, 22080], // 5.0
  [0x33, 983040, 36864], // 5.1
  [0x34, 2073600, 36864], // 5.2
  [0x3c, 4177920, 139264], // 6.0
];

const abortError = () => new DOMException('Export cancelled', 'AbortError');
const nextFrame = () => new Promise((r) => setTimeout(r, 0));

// The lowest level that fits — some encoders (notably Safari's) report an
// over-specified level as supported and then fail on the first frame.
function avcLevel(width, height, fps) {
  const frameSize = Math.ceil(width / 16) * Math.ceil(height / 16);
  const fit = AVC_LEVELS.find(([, mbps, fs]) => frameSize * fps <= mbps && frameSize <= fs);
  return (fit ?? AVC_LEVELS.at(-1))[0].toString(16).padStart(2, '0');
}

// Encoder configs to try, best first: High → Main → Baseline → software.
function candidates(width, height, fps, bitrate) {
  const level = avcLevel(width, height, fps);
  const base = { width, height, framerate: fps, bitrate, avc: { format: 'avc' } };
  return [
    { ...base, codec: `avc1.6400${level}`, label: 'H.264 High' },
    { ...base, codec: `avc1.4d00${level}`, label: 'H.264 Main' },
    { ...base, codec: `avc1.42e0${level}`, label: 'H.264 Baseline' },
    { ...base, codec: `avc1.42e0${level}`, hardwareAcceleration: 'prefer-software', label: 'H.264 (software)' },
  ];
}

async function isSupported({ label, ...config }) {
  try {
    return (await VideoEncoder.isConfigSupported(config)).supported;
  } catch {
    return false;
  }
}

/**
 * Renders every frame offline (never dropping frames) and encodes to MP4 via
 * WebCodecs. If the browser's encoder fails it retries with more conservative
 * settings, and finally falls back to a real-time MediaRecorder capture.
 * Resolves to { blob, method }; never resolves with an empty video.
 */
export async function exportVideo({ settings, logo, background, width, height, fps, onProgress, onStatus, signal }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  const renderer = createRenderer({ logo });
  renderer.setBackground(background);
  const { duration } = renderer.prepare(settings, width, height);
  const bitrate = Math.round(Math.min(80e6, Math.max(8e6, width * height * fps * 0.16)));
  const job = { canvas, ctx, renderer, duration, fps, bitrate, onProgress, signal };

  let lastError = null;
  let muxerLib = null;
  if ('VideoEncoder' in window) {
    try {
      muxerLib = await import(MUXER_URL);
    } catch (err) {
      lastError = new Error('Could not load the MP4 muxer (are you offline?)');
      console.warn(lastError, err);
    }
  }
  if (muxerLib) {
    for (const config of candidates(width, height, fps, bitrate)) {
      if (signal?.aborted) throw abortError();
      if (!(await isSupported(config))) continue;
      try {
        return await encodeOffline(job, config, muxerLib);
      } catch (err) {
        if (signal?.aborted) throw abortError();
        lastError = err;
        console.warn(`Export with ${config.label} (${config.codec}) failed:`, err);
        onStatus?.(`${config.label} encoder failed — retrying with safer settings…`);
        onProgress?.(0);
      }
    }
  }

  if ('MediaRecorder' in window && canvas.captureStream) {
    onStatus?.('Recording in real time (this browser’s encoder is limited)…');
    return recordRealtime(job);
  }
  throw lastError ?? new Error('This browser has no video encoder — try Chrome.');
}

async function encodeOffline({ canvas, ctx, renderer, duration, fps, onProgress, signal }, config, { Muxer, ArrayBufferTarget }) {
  const { label, ...encoderConfig } = config;
  const frames = Math.max(1, Math.round(duration * fps));
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: config.width, height: config.height, frameRate: fps },
    fastStart: 'in-memory',
  });
  let failure = null;
  let chunks = 0;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        muxer.addVideoChunk(chunk, meta);
        chunks++;
      } catch (e) {
        failure ??= e;
      }
    },
    error: (e) => { failure ??= e; },
  });

  const encodeFrame = (i) => {
    renderer.render(ctx, i / fps);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
    try {
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    } finally {
      frame.close();
    }
  };

  try {
    encoder.configure(encoderConfig);
    // Probe: make sure the encoder really accepts frames before committing.
    encodeFrame(0);
    await encoder.flush();
    if (failure) throw failure;
    if (!chunks) throw new Error(`${label} encoder produced no output`);

    for (let i = 1; i < frames; i++) {
      if (signal?.aborted) throw abortError();
      if (failure) throw failure;
      encodeFrame(i);
      while (encoder.encodeQueueSize > 8 && !failure) await nextFrame();
      if (i % 3 === 0) { onProgress?.(i / frames); await nextFrame(); }
    }
    await encoder.flush();
    if (failure) throw failure;
    if (chunks < frames * 0.9) throw new Error(`${label} encoder dropped frames (${chunks}/${frames})`);
    muxer.finalize();
    onProgress?.(1);
    return { blob: new Blob([target.buffer], { type: 'video/mp4' }), method: `${label} (${config.codec})` };
  } catch (err) {
    // A closed encoder throws a generic InvalidStateError; report the real cause.
    throw signal?.aborted ? abortError() : failure ?? err;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
}

async function recordRealtime({ canvas, ctx, renderer, duration, fps, bitrate, onProgress, signal }) {
  const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
    .find((t) => MediaRecorder.isTypeSupported(t));
  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, { ...(type && { mimeType: type }), videoBitsPerSecond: bitrate });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));

  renderer.render(ctx, 0);
  rec.start(500); // timeslice: collect data as we go rather than only on stop
  const t0 = performance.now();
  try {
    await new Promise((resolve, reject) => {
      const tick = () => {
        if (signal?.aborted) { reject(abortError()); return; }
        const t = (performance.now() - t0) / 1000;
        renderer.render(ctx, Math.min(t, duration));
        onProgress?.(Math.min(1, t / duration));
        if (t >= duration) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  } finally {
    rec.stop();
    await stopped;
    stream.getTracks().forEach((tr) => tr.stop());
  }
  const blob = new Blob(chunks, { type: (rec.mimeType || type || 'video/webm').split(';')[0] });
  if (blob.size < 1024) throw new Error('The browser recorded an empty video — try Chrome.');
  return { blob, method: `real-time recording (${blob.type})` };
}

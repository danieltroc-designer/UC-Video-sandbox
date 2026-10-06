// Soundtrack: decoding, preview playback locked to the timeline, and the
// offline mixdown that goes into exported videos.

const FADE_OUT = 0.35; // seconds of fade at the end of the video

let decoder = null;
export async function decodeAudio(arrayBuffer) {
  decoder ??= new OfflineAudioContext(2, 1, 48000);
  return decoder.decodeAudioData(arrayBuffer);
}

export async function loadAudio(src) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Could not load ${src} (${res.status})`);
  return decodeAudio(await res.arrayBuffer());
}

// Sets a gain curve: `volume` until the last FADE_OUT seconds, then down to 0.
function fadeCurve(param, volume, startAt, offset, duration) {
  const fadeFrom = Math.max(0, duration - FADE_OUT);
  const now = startAt;
  if (offset >= duration) { param.setValueAtTime(0, now); return; }
  if (offset < fadeFrom) {
    param.setValueAtTime(volume, now);
    param.setValueAtTime(volume, now + (fadeFrom - offset));
  } else {
    param.setValueAtTime(volume * (1 - (offset - fadeFrom) / FADE_OUT), now);
  }
  param.linearRampToValueAtTime(0, now + (duration - offset));
}

/**
 * The soundtrack exactly as it will sound in the video: trimmed (or padded
 * with silence) to the video length, at the chosen volume, fading out at the end.
 */
export async function mixdown(buffer, { duration, volume = 1, sampleRate = 48000 }) {
  const length = Math.max(1, Math.round(duration * sampleRate));
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  fadeCurve(gain.gain, volume, 0, 0, duration);
  source.connect(gain).connect(ctx.destination);
  source.start(0);
  return ctx.startRendering();
}

/** Plays the soundtrack in step with the preview's timeline. */
export function createPlayer() {
  let ctx = null;
  let master = null; // live volume
  let buffer = null;
  let source = null;
  let volume = 1;
  let muted = false;

  function context() {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    return ctx;
  }

  function stop() {
    if (!source) return;
    try { source.stop(); } catch { /* already stopped */ }
    source.disconnect();
    source = null;
  }

  return {
    get hasAudio() { return !!buffer; },
    setBuffer(b) { stop(); buffer = b; },
    setVolume(v) { volume = v; if (master) master.gain.value = v; },
    setMuted(m) { muted = m; if (m) stop(); },
    // Browsers only allow audio after a user gesture; call this from one.
    unlock() {
      if (context().state === 'suspended') ctx.resume();
    },
    play(offset, duration) {
      stop();
      if (!buffer || muted || offset >= Math.min(duration, buffer.duration)) return;
      const c = context();
      source = c.createBufferSource();
      source.buffer = buffer;
      const fade = c.createGain();
      fadeCurve(fade.gain, 1, c.currentTime, offset, duration);
      source.connect(fade).connect(master);
      source.start(c.currentTime, offset, Math.max(0, duration - offset));
    },
    stop,
  };
}

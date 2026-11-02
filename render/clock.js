/**
 * Virtual clock for frame-exact capture of live DOM animations.
 *
 * Injected before any page script (page.evaluateOnNewDocument). From then on
 * time only moves when the renderer calls window.__vt.advance(ms):
 *
 *  - performance.now / Date.now report virtual time;
 *  - setTimeout / setInterval / requestAnimationFrame are queued and run in
 *    time order as the clock passes them, each seeing its own scheduled time;
 *  - every Web Animation, CSS animation and CSS transition is pinned to the
 *    virtual time since it started. They run at a playback rate of 1e-6 rather
 *    than paused, so they still reach "finished" — `finished` promises resolve
 *    and `animationend` fires on time;
 *  - <video>/<audio> are held paused and seeked to the virtual time: play()
 *    starts a virtual playhead (and `paused` reads false), autoplaying media
 *    is taken over the same way. __vt.mediaBusy() is true while a seek is
 *    still loading, so the renderer can wait for it;
 *  - Math.random is seeded, so a render is repeatable.
 *
 * Must stay self-contained: puppeteer serialises the function source.
 */
export function installClock(seed = 1) {
  if (window.__vt) return;
  const base = performance.now();
  const dateBase = Date.now();
  let now = 0;

  performance.now = () => base + now;
  Date.now = () => dateBase + now;

  // mulberry32
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  let seq = 1;
  const timers = new Map();
  const frames = new Map();
  const starts = new WeakMap();

  window.setTimeout = (fn, ms = 0, ...args) => {
    const id = seq++;
    if (typeof fn === 'function') timers.set(id, { at: now + Math.max(0, +ms || 0), fn, args });
    return id;
  };
  window.setInterval = (fn, ms = 0, ...args) => {
    const id = seq++;
    const every = Math.max(1, +ms || 0);
    if (typeof fn === 'function') timers.set(id, { at: now + every, fn, args, every });
    return id;
  };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (fn) => { const id = seq++; frames.set(id, fn); return id; };
  window.cancelAnimationFrame = (id) => { frames.delete(id); };

  // An animation starts when the code that created it ran — for el.animate()
  // that's the call itself; CSS animations and transitions are picked up right
  // after the timer callback whose style change started them.
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (...args) {
    const a = animate.apply(this, args);
    starts.set(a, now);
    return a;
  };
  const adopt = () => {
    for (const a of document.getAnimations()) if (!starts.has(a)) starts.set(a, now);
  };
  const run = (fn, ...args) => {
    try { fn(...args); } catch (e) { console.error(e); }
  };

  const media = new Map(); // element -> { at: virtual ms, from: its time then (s) }
  const proto = HTMLMediaElement.prototype;
  const nativePlay = proto.play, nativePause = proto.pause;
  const nativePaused = Object.getOwnPropertyDescriptor(proto, 'paused').get;
  proto.play = function () {
    if (!media.has(this)) {
      media.set(this, { at: now, from: this.currentTime || 0 });
      this.dispatchEvent(new Event('play'));
      this.dispatchEvent(new Event('playing'));
    }
    nativePause.call(this);
    return Promise.resolve();
  };
  proto.pause = function () {
    if (media.delete(this)) this.dispatchEvent(new Event('pause'));
    return nativePause.call(this);
  };
  Object.defineProperty(proto, 'paused', { configurable: true, get() { return media.has(this) ? false : nativePaused.call(this); } });
  const syncMedia = () => {
    for (const el of document.querySelectorAll('video, audio')) {
      if (!media.has(el) && !nativePaused.call(el)) { media.set(el, { at: now, from: el.currentTime || 0 }); nativePause.call(el); }
    }
    for (const [el, m] of media) {
      let t = m.from + ((now - m.at) / 1000) * (el.playbackRate || 1);
      const d = el.duration;
      if (d > 0 && Number.isFinite(d)) {
        if (el.loop) t %= d;
        else if (t >= d) { t = d; media.delete(el); el.dispatchEvent(new Event('ended')); }
      }
      if (Math.abs(el.currentTime - t) > 1e-3) el.currentTime = t;
    }
  };

  window.__vt = {
    get now() { return now; },
    get pending() { return timers.size; },
    mediaBusy() { return [...media.keys()].some((el) => el.seeking || (el.readyState < 2 && el.networkState !== 3)); },
    advance(ms) {
      const target = now + Math.max(0, ms);
      for (;;) {
        let next = null;
        for (const [id, t] of timers) if (t.at <= target && (!next || t.at < next[1].at)) next = [id, t];
        if (!next) break;
        const [id, t] = next;
        now = t.at;
        if (t.every) t.at += t.every; else timers.delete(id);
        run(t.fn, ...t.args);
        adopt();
      }
      now = target;
      const due = [...frames.values()];
      frames.clear();
      for (const cb of due) run(cb, base + now);
      adopt();
      for (const a of document.getAnimations()) {
        if (!starts.has(a)) starts.set(a, now);
        a.playbackRate = 1e-6;
        a.currentTime = now - starts.get(a);
      }
      syncMedia();
    },
  };
}

import { clamp, hash } from './easing.js';
import { FRAMES, PROPS, FONT } from './mascot-sprite.js';

// Mascot mode: the pixel character from uploadcare.com playing one reaction
// as a short clip. Like on the site it moves by swapping whole sprite frames
// (no tweening) and every pixel lands on the sprite grid, so it stays crisp at
// any size. render(ctx, t) is deterministic, which keeps exports frame-exact.

const CELL = 24; // sprite cell, in sprite pixels
const VIEW = 40; // sprite pixels across the frame's short edge at 1× size
const BODY = { x0: 3, x1: 23, y0: 6 }; // the standing pose's ink bounds (feet on row 23)
const FACE_X = 11; // between the eyes
const BUBBLE_EDGE = 16; // with props behind his head, the caption stays on the face side of this
const WALK = { ms: 80, stride: 2 }; // one leg frame, and how far it carries him
const LEAD = 0.15, TAIL = 0.3; // empty frames before an entrance / after an exit (s)
const POP = 0.08, TYPE = 0.045; // caption: squashed first frame, then one letter per step (s)
const PAD = [4, 3]; // caption padding, in font pixels
const GREEN = '#00b140'; // standard chroma-key green

// Pixel art → horizontal runs [x, y, length]. With `height`, the art is
// bottom-aligned in a cell that tall.
function parse(art, height) {
  const rows = art.trim().split('\n').map((r) => r.trim());
  const top = (height ?? rows.length) - rows.length;
  const runs = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '#') continue;
      let end = x;
      while (row[end + 1] === '#') end++;
      runs.push([x, top + y, end - x + 1]);
      x = end;
    }
  });
  return { w: Math.max(...rows.map((r) => r.length)), h: height ?? rows.length, runs };
}

const ART = Object.fromEntries(Object.entries(FRAMES).map(([id, art]) => [id, parse(art, CELL)]));
const PROP = Object.fromEntries(Object.entries(PROPS).map(([id, art]) => [id, parse(art)]));
const GLYPHS = Object.fromEntries(Object.entries(FONT).map(([ch, rows]) => {
  const ink = rows.reduce((a, r) => a | r, 0);
  let lo = 0, hi = 4; // trim to the inked columns
  while (lo < 4 && !(ink & (16 >> lo))) lo++;
  while (hi > lo && !(ink & (16 >> hi))) hi--;
  const runs = [];
  rows.forEach((r, y) => { for (let x = lo; x <= hi; x++) if (r & (16 >> x)) runs.push([x - lo, y, 1]); });
  return [ch, { w: hi - lo + 1, h: 7, runs }];
}));
GLYPHS[' '] = { w: 3, h: 7, runs: [] };

// ------------------------------------------------------------- reactions

// One loop of each reaction as [frame, ms, extras] steps. Extras: dx/dy nudge
// the sprite (sprite px), props pop up around it ([name, x, y] in cell px,
// for the left-facing mascot), burst throws confetti. `icon` is the step its
// sidebar tile shows.
const bang = ['bang', 25, -3]; // clear of the raised hand
const hop = (burst) => [
  ['jump4', 80], ['jump3', 80, { dy: -1, burst }], ['jump3', 180, { dy: -3 }], ['jump3', 80, { dy: -1 }], ['jump4', 90],
];
const times = (n, steps) => Array.from({ length: n }, () => steps).flat();

export const REACTIONS = {
  wave: {
    label: 'Wave', icon: 1,
    steps: [['smile', 300], ...times(3, [['wave1', 150], ['wave2', 150]]), ['wave1', 150], ['smile', 450], ['blink', 110], ['smile', 300]],
  },
  idle: { label: 'Idle', icon: 0, steps: [['stand', 2500], ['blink', 110]] }, // the site's own idle
  dance: { label: 'Dance', icon: 0, steps: [['dance0', 130], ['dance1', 180], ['dance2', 130], ['dance1', 180]] }, // the site's ping-pong
  yes: {
    label: 'Yes', icon: 1,
    steps: [['smile', 250], ...times(3, [['nod', 150], ['smile', 150]]), ['happy', 600], ['smile', 300]],
  },
  no: {
    label: 'No', icon: 1,
    steps: [['frownLeft', 300], ...times(2, [['frownRight', 160], ['frownLeft', 160]]), ['frownRight', 160], ['frownLeft', 500], ['blink', 110], ['frownLeft', 300]],
  },
  wow: {
    label: 'Wow', icon: 4,
    steps: [
      ['stand', 450], ['jump4', 90], ['jump3', 300, { dy: -1, props: [bang] }], ['jump4', 90, { props: [bang] }],
      ['jump3', 800, { dy: 2, props: [bang] }], ['blink', 110], ['stand', 400],
    ],
  },
  love: {
    label: 'Love', icon: 0,
    steps: [
      ...[0, 1, 2].flatMap((up) => [
        ['happy', 240, { props: [['heart', 19, -1 - up]] }],
        ['happyDip', 240, { props: [['heartSmall', 20, -up]] }],
      ]),
      ['smile', 400], ['blink', 110], ['smile', 300],
    ],
  },
  think: {
    label: 'Think', icon: 0,
    steps: [
      ['lookUp', 450, { props: [['question', 19, -2]] }], ['lookUp', 450, { props: [['question', 19, -3]] }],
      ['lookUpRight', 450, { props: [['question', 19, -2]] }], ['lookUpRight', 450, { props: [['question', 19, -3]] }],
      ['blink', 110, { props: [['question', 19, -2]] }], ['lookUp', 450, { props: [['question', 19, -2]] }],
    ],
  },
  sleep: {
    label: 'Sleep', icon: 1,
    steps: [
      ['blink', 450, { props: [['zSmall', 20, 1]] }],
      ['sleepDip', 450, { props: [['zSmall', 20, 1], ['zMedium', 23, -5]] }],
      ['blink', 450, { props: [['zSmall', 20, 1], ['zMedium', 23, -5], ['zLarge', 26, -12]] }],
      ['sleepDip', 450, { props: [['zMedium', 23, -5], ['zLarge', 26, -12]] }],
      ['blink', 450, { props: [['zLarge', 26, -12]] }],
      ['sleepDip', 450],
    ],
  },
  party: { label: 'Party', icon: 3, steps: [['stand', 160], ...hop(true), ['stand', 120], ...hop(true), ['happy', 600]] },
  look: {
    label: 'Look', icon: 1,
    steps: [['stand', 400], ['lookRight', 600], ['lookUpRight', 400], ['lookRight', 300], ['stand', 400], ['blink', 110], ['stand', 300]],
  },
  push: {
    label: 'Push', icon: 2, // the site's push, as on the Run button
    steps: [
      ['stand', 400], ...times(2, [['push1', 110], ['push2', 450], ['push1', 110], ['stand', 300]]),
      ['blink', 110], ['stand', 200],
    ],
  },
};

// The site's jump-in, and the same thing backwards to leave.
const JUMP_IN = [['jump0', 120], ['jump1', 110], ['jump2', 100], ['jump3', 100], ['jump4', 110], ['stand', 260]];
const HOP_DOWN = [['jump4', 110], ['jump3', 100], ['jump2', 100], ['jump1', 110], ['jump0', 120]];
export const ENTRANCES = { none: 'None', jump: 'Jump in', walk: 'Walk in' };
export const EXITS = { none: 'None', hop: 'Hop down', walk: 'Walk off' };

const msOf = (steps) => steps.reduce((a, [, ms]) => a + ms, 0);

function drawArt(ctx, art, x0, y0, unit, mirror = false) {
  for (const [x, y, n] of art.runs) {
    ctx.fillRect(x0 + (mirror ? art.w - x - n : x) * unit, y0 + y * unit, n * unit, unit);
  }
}

/** A reaction's tile picture: the pose of its `icon` step, props included. */
export function mascotIcon(id, color = '#ffcf3e') {
  const r = REACTIONS[id];
  const [frame, , x = {}] = r.steps[r.icon];
  const c = document.createElement('canvas');
  c.width = c.height = 30;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  const ox = 2, oy = 30 - CELL; // feet on the bottom edge, room for props above
  drawArt(ctx, ART[frame], ox + (x.dx ?? 0), oy + (x.dy ?? 0), 1);
  for (const [name, px, py] of x.props ?? []) drawArt(ctx, PROP[name], ox + px, oy + py, 1);
  return c;
}

// ---------------------------------------------------------------- renderer

export function createMascotRenderer() {
  let W = 0, H = 0;
  let s = null; // settings
  let L = null; // layout: pixel size, cell origin, colours, caption box
  let T = null; // timeline

  function prepare(settings, width, height) {
    s = settings;
    W = width;
    H = height;
    L = computeLayout();
    T = computeTimeline();
    return { duration: T.duration, timeline: T };
  }

  function palette() {
    const c = s.mascotColor;
    if (s.mascotBackground === 'inverted') return { bg: c, ink: '#000000' };
    if (s.mascotBackground === 'green') return { bg: GREEN, ink: c };
    if (s.mascotBackground === 'custom') return { bg: s.mascotBgColor, ink: c };
    return { bg: '#000000', ink: c };
  }

  function computeLayout() {
    // Whole device pixels per sprite pixel, so every edge stays sharp.
    const p = Math.max(1, Math.round((Math.min(W, H) * s.mascotSize) / VIEW));
    const flip = s.mascotFlip;
    const mx = (x) => (flip ? CELL - x : x); // a cell x for the right-facing mascot
    const ox = Math.round(W / 2 - mx((BODY.x0 + BODY.x1) / 2) * p);
    const margin = 2 * p;
    const face = ox + mx(FACE_X) * p;
    const edge = ox + mx(BUBBLE_EDGE) * p;
    const reaction = REACTIONS[s.mascotReaction] ?? REACTIONS.wave;
    const props = reaction.steps.some(([, , x]) => x?.props?.length);
    const cap = captionBox(p, props ? (flip ? W - margin - edge : edge - margin) : W - 2 * margin);
    const capH = cap ? cap.h + cap.tail + 2 * p : 0;
    const oy = s.mascotPlace === 'center'
      ? Math.round((H - capH - (CELL - BODY.y0) * p) / 2 + capH - BODY.y0 * p)
      : H - CELL * p; // feet on the bottom edge, like the site
    if (cap) {
      const x = props ? (flip ? edge : edge - cap.w) : face - cap.w / 2;
      cap.x = Math.round(clamp(x, margin, Math.max(margin, W - margin - cap.w)));
      cap.y = Math.max(margin, oy + (BODY.y0 - 2) * p - cap.tail - cap.h);
      cap.tailX = cap.x + Math.round(clamp(face - cap.x, 3 * cap.q, cap.w - 3 * cap.q) / cap.q) * cap.q;
    }
    // Horizontal span of the body, flipped as drawn — for walking off screen.
    const [bx0, bx1] = flip ? [CELL - BODY.x1, CELL - BODY.x0] : [BODY.x0, BODY.x1];
    return {
      p, ox, oy, flip, cap, ...palette(),
      offLeft: Math.floor(-ox / p - bx1),
      offRight: Math.ceil((W - ox) / p - bx0),
    };
  }

  // A single line in the pixel font, sized to half a sprite pixel and shrunk
  // until it fits `room` px.
  function captionBox(p, room) {
    const text = s.showCaption ? s.mascotCaption.trim().toUpperCase() : '';
    if (!text) return null;
    const glyphs = [...text].map((ch) => GLYPHS[ch] ?? GLYPHS['?']);
    const tw = glyphs.reduce((a, g) => a + g.w, 0) + glyphs.length - 1;
    let q = Math.max(1, Math.round(p / 2));
    while (q > 1 && (tw + PAD[0] * 2) * q > room) q--;
    return { glyphs, q, w: (tw + PAD[0] * 2) * q, h: (7 + PAD[1] * 2) * q, tail: 2 * q };
  }

  // The mascot faces left, so he walks in from the right and off to the left
  // (mirrored when he faces right).
  function walk(from, to) {
    const n = Math.max(1, Math.ceil(Math.abs(to - from) / WALK.stride));
    const legs = ['stepR', 'stand', 'stepL', 'stand'];
    return Array.from({ length: n + 1 }, (_, i) =>
      [i === n && to === 0 ? 'stand' : legs[i % 4], WALK.ms, { dx: Math.round(from + ((to - from) * i) / n) }]);
  }

  // Fixed length: the reaction repeats a whole number of times, as close to
  // the chosen length as it gets, so the clip loops without a seam.
  function computeTimeline() {
    const k = 1 / (1000 * s.mascotSpeed); // ms → s
    const reaction = REACTIONS[s.mascotReaction] ?? REACTIONS.wave;
    const [inSide, outSide] = L.flip ? [L.offLeft, L.offRight] : [L.offRight, L.offLeft];
    const enter = { jump: JUMP_IN, walk: s.mascotEntrance === 'walk' && walk(inSide, 0) }[s.mascotEntrance];
    const exit = { hop: HOP_DOWN, walk: s.mascotExit === 'walk' && walk(0, outSide) }[s.mascotExit];
    const intro = enter ? LEAD + msOf(enter) * k : 0;
    const outro = exit ? msOf(exit) * k + TAIL : 0;
    const loops = Math.max(1, Math.round((s.mascotLength - intro - outro) / (msOf(reaction.steps) * k)));

    const tl = { beats: [], bursts: [], segments: [] };
    let t = 0;
    const blank = (dur) => tl.beats.push({ start: t, end: (t += dur), frame: null, dx: 0, dy: 0, props: [] });
    const play = (id, label, steps) => {
      const start = t;
      for (const [frame, ms, x = {}] of steps) {
        if (x.burst) tl.bursts.push({ t, seed: tl.bursts.length + 1 });
        tl.beats.push({ start: t, end: (t += ms * k), frame, dx: x.dx ?? 0, dy: x.dy ?? 0, props: x.props ?? [] });
      }
      tl.segments.push({ id, label, start, end: t });
    };

    if (enter) { blank(LEAD); play('enter', ENTRANCES[s.mascotEntrance], enter); }
    const settled = t;
    for (let i = 0; i < loops; i++) play('react', reaction.label, reaction.steps);
    // Without an entrance the caption is there from the first frame, so it loops cleanly too.
    tl.caption = { start: settled, end: t, pop: !!enter };
    if (L.cap) tl.segments.push({ id: 'caption', label: 'Caption', start: settled, end: t });
    if (exit) { play('exit', EXITS[s.mascotExit], exit); blank(TAIL); }
    tl.duration = t;
    return tl;
  }

  // ----------------------------------------------------------------- render

  function beatAt(t) {
    const beats = T.beats;
    let lo = 0, hi = beats.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (beats[mid].start <= t) lo = mid; else hi = mid - 1;
    }
    return beats[lo];
  }

  function render(ctx, t) {
    const { p, ox, oy, flip } = L;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.fillStyle = L.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = L.ink;
    const beat = beatAt(t);
    if (beat.frame) drawArt(ctx, ART[beat.frame], ox + beat.dx * p, oy + beat.dy * p, p, flip);
    for (const [name, x, y] of beat.props) {
      const art = PROP[name]; // props move to the other side but aren't mirrored (a ? stays a ?)
      drawArt(ctx, art, ox + (flip ? CELL - x - art.w : x) * p, oy + y * p, p);
    }
    drawConfetti(ctx, t);
    drawCaption(ctx, t);
    ctx.restore();
  }

  // Each burst throws a handful of pixels up from behind his head; they arc,
  // blink out, and stay hidden behind him (one colour, so they'd only read as
  // bumps on the body). Steps at 12 fps like sprite frames.
  function drawConfetti(ctx, t) {
    const { p, ox, oy, flip } = L;
    for (const b of T.bursts) {
      const age = Math.floor((t - b.t) * 12) / 12;
      if (age < 0 || age > 1.2) continue;
      for (let i = 0; i < 14; i++) {
        const r = (n) => hash(b.seed * 1013 + i * 31 + n);
        const life = 0.55 + 0.6 * r(1);
        if (age > life || (age > life * 0.7 && Math.round(age * 12) % 2)) continue;
        const n = r(5) < 0.35 ? 2 : 1;
        const side = r(2) < 0.5 ? -1 : 1;
        const x = Math.round(12 + side * (2 + 4 * r(4) + (8 + 22 * r(6)) * age));
        const y = Math.round(2 - 2 * r(7) - (14 + 22 * r(3)) * age + 45 * age * age);
        if (x + n > BODY.x0 - 1 && x < BODY.x1 + 1 && y + n > 0) continue; // behind him
        ctx.fillRect(ox + (flip ? CELL - x - n : x) * p, oy + y * p, n * p, n * p);
      }
    }
  }

  // Speech bubble: ink box with knocked-off corners and a stepped tail, the
  // text cut out of it in the background colour and typed on letter by letter.
  function drawCaption(ctx, t) {
    const c = L.cap, C = T.caption;
    if (!c || t < C.start || t >= C.end) return;
    const age = C.pop ? t - C.start : Infinity;
    const q = c.q;
    const box = (x, y, w, h) => {
      ctx.fillRect(x + q, y, w - 2 * q, h);
      ctx.fillRect(x, y + q, w, h - 2 * q);
    };
    ctx.fillStyle = L.ink;
    const bottom = c.y + c.h;
    ctx.fillRect(c.tailX - 2 * q, bottom, 4 * q, q);
    ctx.fillRect(c.tailX - q, bottom + q, 2 * q, q);
    if (age < POP) {
      const w = Math.round(c.w / 2 / q) * q, h = Math.round(c.h / 2 / q) * q;
      box(c.tailX - Math.round(w / 2 / q) * q, bottom - h, w, h);
      return;
    }
    box(c.x, c.y, c.w, c.h);
    ctx.fillStyle = L.bg;
    let x = c.x + PAD[0] * q;
    const shown = Math.floor((age - POP) / TYPE) + 1;
    c.glyphs.slice(0, shown).forEach((g) => {
      drawArt(ctx, g, x, c.y + PAD[1] * q, q);
      x += (g.w + 1) * q;
    });
  }

  return { prepare, render, setBackground() {} };
}

// Camera shots for library/camera.html.
//
// A shot is a list of cuts, in the card's own 1920×1080 screen space. Each cut
// starts at `t` (seconds into the card) and holds until the next one; the change
// between cuts is a hard cut, and within a cut the camera drifts very slowly from
// `from` to `to` (anything `to` leaves out stays as in `from`):
//   x, y  the point the camera centres on
//   zoom  framing for a portrait (1080×1920) frame — scaled for other shapes
//   rx, ry, rz  camera tilt in degrees (rx: look down/up, ry: from the side, rz: roll)
// A faint handheld sway is added on top. Headings never show in camera shots
// (the motion is the point); a shot can hide more with `hide: ['.selector', …]`.

const FORMAT_ZOOM = { portrait: 1, square: 0.84, landscape: 0.6 };

// Anything without its own shot: one slow push-in across the middle of the screen.
const DEFAULT_SHOT = {
  cuts: [
    { t: 0, from: { x: 900, y: 610, zoom: 1.5, rx: 12, ry: -15, rz: -1.8 }, to: { x: 960, y: 625, zoom: 1.58, ry: -13 } },
  ],
};

// Shots that cut to each card's beats.
const SHOTS = {
  'ecommerce-expo': {
    // Product flow: drag into the uploader → upload → photo resolves → storefront.
    0: {
      cuts: [
        { t: 0, from: { x: 690, y: 565, zoom: 2.0, rx: 13, ry: -17, rz: -2 }, to: { x: 700, y: 585, zoom: 2.06, ry: -16 } },
        { t: 2.4, from: { x: 672, y: 628, zoom: 2.4, rx: 10, ry: 13, rz: 1.4 }, to: { x: 690, y: 634, zoom: 2.47, ry: 12 } },
        { t: 4.4, from: { x: 1300, y: 630, zoom: 1.95, rx: 11, ry: -14, rz: -1.6 }, to: { x: 1306, y: 645, zoom: 2.01, ry: -13 } },
        // the analysis fades out 7.2–7.4; already on the storefront as it loads in (7.4–7.8)
        { t: 7.4, from: { x: 630, y: 750, zoom: 1.5, rx: 12, ry: 12, rz: 1.4 }, to: { x: 650, y: 758, zoom: 1.55, ry: 11 } },
        { t: 8.7, from: { x: 1205, y: 700, zoom: 1.85, rx: 9, ry: -10, rz: -1 }, to: { x: 1215, y: 708, zoom: 1.89 } },
      ],
    },
    // AI catalog admin: backend photo → Edit with AI → editor generates → Add to media → storefront.
    3: {
      cuts: [
        { t: 0, from: { x: 540, y: 610, zoom: 2.05, rx: 13, ry: -17, rz: -2 }, to: { x: 545, y: 632, zoom: 2.12, ry: -16 } },
        // the editor fades in 2.9–3.1: wide on the photo and the prompt being typed
        { t: 3.05, from: { x: 950, y: 680, zoom: 1.45, rx: 11, ry: 9, rz: 1 }, to: { x: 962, y: 684, zoom: 1.5 } },
        // tight on the bottle as it regenerates
        { t: 5.2, from: { x: 960, y: 600, zoom: 2.4, rx: 10, ry: -10, rz: -1.2 }, to: { x: 966, y: 610, zoom: 2.47, ry: -9 } },
        // the pointer travels to Add to media (8.0–8.6) and clicks
        // …and the editor closes (9.2–9.4)
        { t: 8.1, from: { x: 1300, y: 800, zoom: 1.9, rx: 12, ry: 13, rz: 1.5 }, to: { x: 1308, y: 806, zoom: 1.94 } },
        // already on the storefront as it loads in (9.5–9.8)
        { t: 9.4, from: { x: 600, y: 770, zoom: 1.5, rx: 12, ry: -11, rz: -1.2 }, to: { x: 622, y: 778, zoom: 1.55, ry: -10 } },
        { t: 11, from: { x: 1180, y: 690, zoom: 1.85, rx: 9, ry: 10, rz: 1 }, to: { x: 1192, y: 698, zoom: 1.89 } },
      ],
    },
  },
};

export function shotFor(deck, card, info, format = 'portrait') {
  const base = SHOTS[deck]?.[card] ?? DEFAULT_SHOT;
  const z = FORMAT_ZOOM[format] ?? 1;
  const scaled = (c) => ({ ...c, zoom: c.zoom * z });
  return {
    ...base,
    duration: info.duration,
    cuts: base.cuts.map((c) => ({ t: c.t, from: scaled(c.from), to: scaled({ ...c.from, ...c.to }) })),
  };
}

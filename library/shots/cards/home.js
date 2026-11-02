// uploadcare.com, the homepage

// The "how it works" demo (upload → analyse → deliver), rebuilt frame-exact in
// library/uploadcare-web: all three panels in 16:9, one panel each for 9:16 and 1:1.
const demo = [
  { kind: 'deck', deck: 'uploadcare-web', card: 0, label: 'Home · How it works', title: 'Upload, analyse, deliver: the homepage demo', duration: 13, formats: ['landscape'] },
  { kind: 'deck', deck: 'uploadcare-web', card: 1, label: 'Home · Demo upload', title: 'A photo drops in and uploads', duration: 6.2, formats: ['portrait', 'square'] },
  { kind: 'deck', deck: 'uploadcare-web', card: 2, label: 'Home · Demo analyse', title: 'Pixel scan, checks and readout', duration: 8.3, formats: ['portrait', 'square'] },
  { kind: 'deck', deck: 'uploadcare-web', card: 3, label: 'Home · Demo deliver', title: 'URL transforms crop the face', duration: 7.6, formats: ['portrait', 'square'] },
];

// Workarounds the player has no option for yet.

// SMIL <animate>s (the globe's meridians) run on the wall clock, not on the
// renderer's virtual one: pause them and drive their time from performance.now().
const smilOnPageClock = (sel) => (doc, win) => {
  const svgs = [...doc.querySelectorAll(sel)];
  for (const s of svgs) s.pauseAnimations();
  const t0 = win.performance.now();
  const tick = () => {
    for (const s of svgs) s.setCurrentTime((win.performance.now() - t0) / 1000);
    win.requestAnimationFrame(tick);
  };
  tick();
};

// The player's shape, read from the deck page around the filmed one. (The Camera
// look always plays a card's 16:9 layout.)
const formatOf = (win) => win.parent.document.getElementById('stage')?.dataset.format;
const addStyle = (doc, css) => doc.head.append(Object.assign(doc.createElement('style'), { textContent: css }));

// Extra styles for some shapes only.
const cssFor = (byFormat) => (doc, win) => {
  const css = byFormat[formatOf(win)];
  if (css) addStyle(doc, css);
};

// ------------------------------------------------------------------- hero

// Events around the globe come from a seeded Math.random, so they're the same
// in every render: a request lands at the left (2.0–5.8 s) and a video upload
// at the right (4.75 s on: thumbnail 5.8, progress 7.2, collapse 8.3, log 9.3–11.4).
// Close-ups 260–300 px wide (the 8 px log text comes out at 29–33 px), placed so
// no cut-off letters of the headline show at their edges.
const REQUEST = { rect: [135, 583, 300, 100], pad: 0 };
const UPLOAD = { rect: [1140, 295, 260, 100], pad: 0 };

const hero = [
  {
    kind: 'site', page: 'home', label: 'Home · Hero',
    title: 'The globe fades in, uploads and requests pop up around it, and the highlight follows the cursor',
    duration: 12, target: 'section.hero',
    actions: [{ t: 0, call: smilOnPageClock('svg.hero__earth') }],
    cursorFrom: [760, 690],
    cursor: [
      { t: 2.2, to: [430, 700], move: 2.0 },
      { t: 3.4, to: [335, 712], move: 1.2 },
      { t: 4.5, to: [352, 704], move: 1.1 },
      { t: 6.5, to: [1212, 428], move: 2.0 },
      { t: 9.0, to: [1196, 440], move: 2.5 },
      { t: 11.8, to: [1186, 446], move: 2.8 },
    ],
    views: {
      landscape: [{ t: 0, el: 'section.hero', pad: 40 }],
      // the headline, close on the request, back out, close on the upload
      portrait: [
        { t: 0, el: '.hero__head', pad: 40 },
        { t: 2.0, ...REQUEST, dur: 1.0 },
        { t: 4.7, el: '.hero__head', pad: 40, dur: 0.8 },
        { t: 5.3, ...UPLOAD, dur: 1.1 },
      ],
      square: [
        { t: 0, el: '.hero__head', pad: 60 },
        { t: 2.0, ...REQUEST, dur: 1.0 },
        { t: 4.7, el: '.hero__head', pad: 60, dur: 0.8 },
        { t: 5.3, ...UPLOAD, dur: 1.1 },
      ],
    },
  },
];

// ------------------------------------------------------------------ bento

const UPLOADER = '.card.uploader-card';
const COMPARE = '.card.compare';
const URL_API = '.card.url-api';
const ABR = '.card.abr-card';
const WEBHOOKS = '.card.webhooks-storage-card';

// In the tall shapes the close-ups show bits of the neighbouring cards: dim all
// but the hovered one. Dimmed from the first frame, then fading as the cursor moves.
const spotlight = (doc, win) => {
  if (formatOf(win) === 'landscape') return;
  addStyle(doc, '.bento .card:not(.uc-hover) { opacity: .3; }');
  for (const c of doc.querySelectorAll('.bento .card')) win.getComputedStyle(c).opacity;
  addStyle(doc, '.bento .card { transition: opacity .5s ease, box-shadow .2s !important; }');
};

// one bento card, close: the whole card in every shape (centred, though it sits
// at the side of the page: the rest of the page is hidden anyway)
const cardViews = (el) => ({
  landscape: [{ t: 0, el, pad: 60, clamp: false }],
  portrait: [{ t: 0, el, pad: 20, clamp: false }],
  square: [{ t: 0, el, pad: 30, clamp: false }],
});

const bento = [
  {
    kind: 'site', page: 'home', label: 'Home · Bento tour',
    title: 'The cursor hovers each platform card in turn, and each one comes alive',
    duration: 12, target: 'section.bento', viewport: [1440, 1120],
    // in from the top, then neighbour to neighbour, so no card is crossed on the way:
    // compare (sweep 0.4–3.0), uploader, URL API (two turns), video (SD → 4K), webhooks
    cursorFrom: [1100, -60],
    actions: [{ t: 0, call: spotlight }],
    cursor: [
      { t: 1.0, to: COMPARE, at: [0.42, 0.55], move: 0.9 },
      { t: 3.65, to: UPLOADER, at: [0.6, 0.45], move: 0.6 },
      { t: 5.2, to: URL_API, at: [0.55, 0.42], move: 0.6 },
      { t: 7.05, to: ABR, at: [0.5, 0.42], move: 0.55 },
      { t: 10.4, to: WEBHOOKS, at: [0.48, 0.45], move: 0.55 },
    ],
    views: {
      landscape: [{ t: 0, el: '.bento__rows', pad: 40 }],
      // the grid's bottom row sits low in the frame: let the close-ups leave it
      portrait: [
        { t: 0, el: COMPARE, pad: 30, clamp: false },
        { t: 3.0, el: UPLOADER, pad: 30, clamp: false },
        { t: 4.55, el: URL_API, pad: 30, clamp: false },
        { t: 6.65, el: ABR, pad: 30, clamp: false },
        { t: 9.8, el: WEBHOOKS, pad: 30, clamp: false },
      ],
      square: [
        { t: 0, el: COMPARE, pad: 40, clamp: false },
        { t: 3.0, el: UPLOADER, pad: 40, clamp: false },
        { t: 4.55, el: URL_API, pad: 40, clamp: false },
        { t: 6.65, el: ABR, pad: 40, clamp: false },
        { t: 9.8, el: WEBHOOKS, pad: 40, clamp: false },
      ],
    },
  },
  {
    kind: 'site', page: 'home', label: 'Home · Uploader card',
    title: 'Hovered, the file slides toward the drop zone and it lights up',
    duration: 5.5, target: UPLOADER,
    cursorFrom: [560, 960],
    cursor: [
      { t: 1.4, to: '.source-modal__dropzone', at: [0.62, 0.62], move: 1.0 },
      { t: 4.6, to: [560, 980], move: 1.0 },
    ],
    views: cardViews(UPLOADER),
  },
  {
    kind: 'site', page: 'home', label: 'Home · Image compare',
    title: 'Hovered, the JPEG/AVIF split sweeps left, right and back',
    duration: 5, target: COMPARE,
    // hovered from 0.57 s; the sweep takes 2.55 s
    cursorFrom: [1150, 960],
    cursor: [
      { t: 1.0, to: COMPARE, at: [0.42, 0.62], move: 0.9 },
      { t: 4.4, to: [1150, 980], move: 0.8 },
    ],
    views: cardViews(COMPARE),
  },
  {
    kind: 'site', page: 'home', label: 'Home · URL API',
    title: 'Hovered, the operation wheel turns and each op slots into the URL',
    duration: 5.4, target: URL_API,
    // hovered from 0.63 s; one 4 s turn of the wheel, out while it rests back on rotate (4.2–4.6)
    cursorFrom: [420, 960],
    cursor: [
      { t: 1.0, to: URL_API, at: [0.6, 0.7], move: 0.9 },
      { t: 4.9, to: [420, 980], move: 0.8 },
    ],
    views: cardViews(URL_API),
  },
  {
    kind: 'site', page: 'home', label: 'Home · Adaptive video',
    title: 'Hovered, the video plays and steps up from SD to 4K',
    duration: 5, target: ABR,
    // hovered from 0.57 s: SD, HD 1.5, FHD 2.4, 4K 3.3; out at 3.9, before it drops back to SD
    cursorFrom: [840, 960],
    cursor: [
      { t: 1.0, to: '.abr-card__media', at: [0.62, 0.72], move: 0.9 },
      { t: 4.3, to: [840, 980], move: 0.7 },
    ],
    views: cardViews(ABR),
  },
  {
    kind: 'site', page: 'home', label: 'Home · Webhooks and storage',
    title: 'Hovered, the storage boxes drop into a stack, flash, and the logo on top sparkles',
    duration: 6.6, target: WEBHOOKS,
    // hovered from 0.6 s; out at 5.5, and the stack lifts back
    cursorFrom: [1260, 960],
    cursor: [
      { t: 1.0, to: WEBHOOKS, at: [0.6, 0.6], move: 0.9 },
      { t: 6.0, to: [1260, 980], move: 0.8 },
    ],
    views: {
      ...cardViews(WEBHOOKS),
      // in on the stack for the sparkles (the card is centred: its stack is at
      // 1042–1240 × 298–525 in the window), back out before the cursor leaves
      square: [
        { t: 0, el: WEBHOOKS, pad: 30, clamp: false },
        { t: 1.1, rect: [1020, 285, 240, 250], pad: 30, dur: 1.2 },
        { t: 4.5, el: WEBHOOKS, pad: 30, clamp: false, dur: 1.0 },
      ],
    },
  },
];

// -------------------------------------------------------------- CLI demo

const cli = [
  {
    kind: 'site', page: 'home', label: 'Home · CLI demo',
    title: 'Run, and Run again: the terminal prints each result and types the next command',
    duration: 10, target: '[data-cli-root]', isolate: ['section.cli-demo'],
    // Run is disabled while a run plays: 1.35–3.8 (upload) and 4.75–8.9 (list, then
    // typing the delete); the mascot dances meanwhile
    cursorFrom: [700, 960],
    cursor: [
      { t: 1.2, to: '[data-cli-run]', at: [0.55, 0.6], move: 1.0, click: true },
      { t: 2.6, to: '[data-cli-run]', at: [0.42, 0.45], move: 1.2 },
      { t: 4.6, to: '[data-cli-run]', at: [0.52, 0.55], move: 0.6, click: true },
      { t: 7.0, to: '[data-cli-run]', at: [0.62, 0.4], move: 1.6 },
    ],
    views: {
      // the terminal itself (the links beside it don't move): its text 31 px
      landscape: [{ t: 0, el: '.cli-demo__main', pad: 40 }],
      // the commands and the left of the output, big enough to read (14 px → 23 px)
      portrait: [{ t: 0, el: '.cli-demo__main', pad: 0, zoom: 1.24, dx: -99 }],
      square: [{ t: 0, el: '.cli-demo__main', pad: 0, zoom: 1.18, dx: -83 }],
    },
  },
];

// ----------------------------------------------------------- testimonial

// The words paint in as the quote scrolls up from 66% to 23% of the window.
// The window is 1700 tall, so the quote and its byline fit below 66%: its top
// starts there (scrollOffset, for the quote's 173 px) and the page scrolls the
// 731 px to 23%, and a little more.
const testimonial = [
  {
    kind: 'site', page: 'home', label: 'Home · Testimonial',
    title: 'The quote paints in word by word as the page scrolls',
    duration: 8.5, target: '.testimonial-quote__text', isolate: ['section.testimonial-quote'],
    viewport: [1440, 1700], scrollOffset: -358.5,
    actions: [
      // the quote in a narrower column for the tall shapes, so it fills them
      { t: 0, call: cssFor({
        portrait: '.testimonial-quote__blockquote { max-width: 520px !important; }',
        square: '.testimonial-quote__blockquote { max-width: 620px !important; }',
      }) },
      { t: 0.8, scroll: 735, dur: 6.2 },
    ],
    views: {
      landscape: [{ t: 0, el: '.testimonial-quote__blockquote', pad: 90, clamp: false }],
      portrait: [{ t: 0, el: '.testimonial-quote__blockquote', pad: 40, clamp: false }],
      square: [{ t: 0, el: '.testimonial-quote__blockquote', pad: 60, clamp: false }],
    },
  },
];

// ---------------------------------------------------------- story cards

const story = (n) => `[data-story-card]:nth-child(${n})`;

const stories = [
  {
    kind: 'site', page: 'home', label: 'Home · Customer stories',
    title: 'The cursor moves across the customer stories and each one opens up',
    duration: 9, target: '.story-cards__grid', isolate: ['section.story-cards'],
    cursorFrom: [700, 960],
    // fixed points: the cards change width under the cursor
    cursor: [
      { t: 1.2, to: [420, 470], move: 1.0 },
      { t: 3.0, to: [943, 480], move: 0.9 },
      { t: 5.0, to: [1216, 470], move: 0.8 },
      { t: 7.0, to: [1306, 480], move: 0.6 },
    ],
    views: {
      landscape: [{ t: 0, el: '.story-cards__grid', pad: 60 }],
      portrait: [
        { t: 0, el: story(1), pad: 24 },
        { t: 2.5, el: story(2), pad: 24, dur: 1.0 },
        { t: 4.5, el: story(3), pad: 24, dur: 1.0 },
        { t: 6.6, el: story(4), pad: 24, dur: 1.0 },
      ],
      // the neighbours peek in less than their 30 px padding: colour, no cut-off text
      square: [
        { t: 0, el: story(1), pad: 24 },
        { t: 2.5, el: story(2), pad: 24, dur: 1.0 },
        { t: 4.5, el: story(3), pad: 24, dur: 1.0 },
        { t: 6.6, el: story(4), pad: 24, dur: 1.0 },
      ],
    },
  },
];

export default [...hero, ...demo, ...bento, ...cli, ...testimonial, ...stories];

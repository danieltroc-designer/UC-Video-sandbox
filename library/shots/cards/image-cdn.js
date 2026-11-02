// uploadcare.com/cdn/image-cdn

// ------------------------------------------------- ImageProcessingDemo
// section.proc-demo: six tabs on a rail. Delivery auto-cycles its devices
// (and follows hover), Optimize and Enhance are before/after sliders that
// track the pointer, Make responsive switches crops, Add watermarks swaps the
// overlay. Every switch scrambles the URL in the bar above the rail.

const tab = (name) => `#image-cdn-demo-tab-${name}`;
const node = (name) => `[data-delivery-node="${name}"]`;
const demoBase = { kind: 'site', page: 'image-cdn', target: '.proc-demo__stage', isolate: ['.proc-demo'] };

// Per-shape page styles. The player has no per-format `css`, so an action at
// t=0 reads the shape off the stage (the iframe is same-origin) and adds them.
const formatOf = (win) => win.parent.document.getElementById('stage')?.dataset.format;
const formatCss = (byFormat) => ({
  t: 0,
  call(doc, win) {
    const css = byFormat[formatOf(win)];
    if (css) doc.head.append(Object.assign(doc.createElement('style'), { textContent: css }));
  },
});
// A w×670 slice of the demo stage centred on x, for panning along the rail.
const slice = (x, w = 640) => ({ rect: [x - w / 2, 115, w, 670] });

// Delivery close-ups: each device, with the end of its URL where it reaches.
const deviceViews = [
  { t: 0, rect: [80, 190, 320, 480], pad: 20 },
  { t: 2.3, rect: [560, 120, 300, 545], pad: 20 },
  { t: 4.1, rect: [720, 395, 380, 390], pad: 20 },
  { t: 5.9, rect: [1100, 120, 260, 420], pad: 20 },
];

const demo = [
  {
    ...demoBase, label: 'Image CDN · Demo tour',
    title: 'The cursor clicks through all six tabs of the processing demo',
    duration: 12,
    cursor: [
      { t: 1.0, to: tab('delivery'), move: 0.9 },
      { t: 2.4, to: tab('optimize'), click: true },
      { t: 4.2, to: tab('responsive'), click: true },
      { t: 6.0, to: tab('watermarks'), click: true },
      { t: 7.8, to: tab('blur'), click: true },
      { t: 9.6, to: tab('enhance'), click: true },
    ],
    views: {
      landscape: [{ t: 0, el: '.proc-demo__stage', pad: 40 }],
      // a slice of the stage that steps along with the cursor, halfway between
      // the panel's centre (x 720) and the tab being clicked
      portrait: [469, 531, 632, 732, 833, 934].map((x, i) => ({ t: i ? 1.7 + 1.8 * (i - 1) : 0, ...slice(x, 560), pad: 10, dur: 0.8 })),
      square: [469, 531, 632, 732, 833, 934].map((x, i) => ({ t: i ? 1.7 + 1.8 * (i - 1) : 0, ...slice(x, 800), pad: 10, dur: 0.8 })),
    },
  },
  {
    ...demoBase, label: 'Image CDN · Delivery',
    title: 'Hovering each device: the right size and format, and its URL',
    duration: 9,
    cursorFrom: [300, 960],
    // the close-ups are of the devices: the tab rail would only cover the phone
    actions: [formatCss({ portrait: '.proc-demo__rail { opacity: 0 !important; }', square: '.proc-demo__rail { opacity: 0 !important; }' })],
    cursor: [
      { t: 1.2, to: node('origin') + ' .delivery__frame', at: [0.5, 0.45], move: 1.0 },
      { t: 3.0, to: node('desktop') + ' .delivery__frame', at: [0.5, 0.5] },
      { t: 4.8, to: node('mobile') + ' .delivery__frame', at: [0.5, 0.2] },
      { t: 6.6, to: node('tablet') + ' .delivery__frame', at: [0.5, 0.5] },
    ],
    views: {
      landscape: [{ t: 0, el: '.proc-demo__stage', pad: 40 }],
      portrait: deviceViews,
      square: deviceViews,
    },
  },
  {
    ...demoBase, label: 'Image CDN · Optimize',
    title: 'Optimize: the cursor drags the original/optimized split across the photo',
    duration: 8.6,
    cursorFrom: [342, 960],
    cursor: [
      { t: 1.0, to: tab('optimize'), move: 0.9, click: true },
      { t: 2.6, to: [720, 420], move: 1.0 },
      { t: 4.2, to: [400, 420], move: 1.4 },
      { t: 6.2, to: [1060, 420], move: 1.8 },
      { t: 7.6, to: [720, 420], move: 1.1 },
    ],
    views: {
      landscape: [{ t: 0, el: '.proc-demo__stage', pad: 40 }],
      // the tab and the left of the photo, then the split, following the cursor
      portrait: [
        { t: 0, rect: [200, 115, 560, 670], pad: 0 },
        { t: 1.6, cursor: true, w: 560, dy: 30, dur: 1.0 },
      ],
      square: [
        { t: 0, rect: [150, 115, 700, 670], pad: 0 },
        { t: 1.6, cursor: true, w: 700, dy: 30, dur: 1.0 },
      ],
    },
  },
  {
    ...demoBase, label: 'Image CDN · Responsive crop',
    title: 'Make responsive: centred crop vs content-aware crop on desktop and phone',
    duration: 8.4,
    cursorFrom: [543, 960],
    cursor: [
      { t: 1.0, to: tab('responsive'), move: 0.9, click: true },
      { t: 2.8, to: '#image-cdn-demo-crop-tab-center', move: 0.9, click: true },
      { t: 5.2, to: '#image-cdn-demo-crop-tab-smart', move: 0.7, click: true },
    ],
    views: {
      landscape: [{ t: 0, el: '.proc-demo__stage', pad: 40 }],
      // the tab, then a pan across to the phone crop at the same scale
      portrait: [
        { t: 0, rect: [333, 115, 421, 670], pad: 30 },
        { t: 1.4, el: '.responsive__slot--mobile', pad: 30, dur: 1.1 },
      ],
      square: [
        { t: 0, rect: [333, 115, 421, 670], pad: 30, cover: true, dy: 180 },
        { t: 1.4, el: '.responsive__slot--mobile', pad: 30, cover: true, dy: -60, dur: 1.1 },
      ],
    },
  },
  {
    ...demoBase, label: 'Image CDN · Watermarks',
    title: 'Add watermarks: clicking pattern, logo and waves scans each overlay in',
    duration: 8.4,
    cursorFrom: [744, 960],
    cursor: [
      { t: 1.0, to: tab('watermarks'), move: 0.9, click: true },
      { t: 2.8, to: '[data-watermark-option="logo"]', move: 0.9, click: true },
      { t: 4.6, to: '[data-watermark-option="waves"]', click: true },
      { t: 6.4, to: '[data-watermark-option="pattern"]', click: true },
    ],
    views: {
      landscape: [{ t: 0, el: '.proc-demo__stage', pad: 40 }],
      // picker, tab and most of the photo; the panel is hidden at t=0, so rects
      portrait: [{ t: 0, rect: [350, 115, 650, 670], pad: 16 }],
      square: [{ t: 0, rect: [356, 115, 728, 670], pad: 24 }],
    },
  },
  {
    ...demoBase, label: 'Image CDN · Enhance',
    title: 'Enhance: the cursor sweeps the before/after split over the prism',
    duration: 8.6,
    cursorFrom: [1147, 960],
    cursor: [
      { t: 1.0, to: tab('enhance'), move: 0.9, click: true },
      { t: 2.6, to: [720, 420], move: 1.0 },
      { t: 4.2, to: [420, 420], move: 1.4 },
      { t: 6.2, to: [1030, 420], move: 1.8 },
      { t: 7.6, to: [720, 420], move: 1.1 },
    ],
    views: {
      landscape: [{ t: 0, el: '.proc-demo__stage', pad: 40 }],
      portrait: [
        { t: 0, rect: [700, 115, 560, 670], pad: 0 },
        { t: 1.6, cursor: true, w: 560, dy: 30, dur: 1.0 },
      ],
      square: [
        { t: 0, rect: [640, 115, 700, 670], pad: 0 },
        { t: 1.6, cursor: true, w: 700, dy: 30, dur: 1.0 },
      ],
    },
  },
];

// ------------------------------------------------------ ProcessingDials
// section.dials: once in view, every 3 s (first at 1.5 s) the three dials spin
// to new values, the photos crossfade and the sizes scramble. No cursor.

// the readout windows, MODE/OPTIMIZED and the donut
const instrument = { rect: [550, 280, 340, 200] };
const dials = [
  {
    kind: 'site', page: 'image-cdn', label: 'Image CDN · Dials',
    title: 'Breakpoint, format and quality dials spin; the photos and sizes follow',
    duration: 10.5, target: '.dials__card', isolate: ['.dials'],
    // the column copy below the dials only gets in the way of the tall close-ups
    actions: [formatCss({ portrait: '.dials__columns-wrap { display: none !important; }' })],
    views: {
      landscape: [{ t: 0, el: '.dials__card', pad: 40 }],
      portrait: [
        { t: 0, ...instrument, pad: 30 },
        { t: 3.4, el: '[data-dial-photo="source"]', pad: 40, dur: 1.0 },
        { t: 6.3, el: '[data-dial-photo="result"]', pad: 40, dur: 1.1 },
        { t: 9.2, ...instrument, pad: 30, dur: 1.2 },
      ],
      square: [
        { t: 0, ...instrument, pad: 40 },
        { t: 3.4, el: '[data-dial-photo="source"]', pad: 40, dur: 1.0 },
        { t: 6.3, el: '[data-dial-photo="result"]', pad: 40, dur: 1.1 },
        { t: 9.2, ...instrument, pad: 40, dur: 1.2 },
      ],
    },
  },
];

// ------------------------------------------------------------ the bento
// section.proc-bento: four cards that come alive on hover (the accordion on
// click). The grid is 982 px tall, so these cards film a 1440×1080 page.
// The URL API card is the homepage's (Home · URL API); here it only shows up
// in the tour.

const bentoBase = { kind: 'site', page: 'image-cdn', viewport: [1440, 1080] };
// animation only: the cards without their title and description
const PLAIN = { hide: ['.proc-bento__text'] };
const card = (name) => `.proc-bento__${name}-card`;

const bento = [
  {
    ...bentoBase, label: 'Image CDN · Bento tour',
    title: 'The cursor hovers each card of the processing bento in turn',
    duration: 12, target: '.proc-bento', plain: PLAIN,
    cursorFrom: [400, 1140],
    cursor: [
      { t: 1.0, to: card('url'), at: [0.62, 0.42], move: 1.0 },
      { t: 3.6, to: card('ops'), at: [0.5, 0.4], move: 0.9 },
      { t: 6.4, to: card('fan'), at: [0.55, 0.35], move: 0.9 },
      // fixed points: the summaries slide as the panels open, and a hand wouldn't follow them
      { t: 9.4, to: [291, 863], move: 0.9, click: true },
      { t: 11.2, to: [291, 919], move: 0.6, click: true },
    ],
    views: {
      landscape: [{ t: 0, el: '.proc-bento__cols', pad: 40 }],
      portrait: [
        { t: 0, el: card('url'), pad: 24 },
        { t: 2.8, el: card('ops'), pad: 24 },
        { t: 5.6, el: card('fan'), pad: 24 },
        { t: 8.6, el: card('accordion'), pad: 24 },
      ],
      square: [
        { t: 0, el: card('url'), pad: 30 },
        { t: 2.8, el: card('ops'), pad: 30 },
        { t: 5.6, el: card('fan'), pad: 30 },
        { t: 8.6, el: card('accordion'), pad: 30 },
      ],
    },
  },
  {
    ...bentoBase, label: 'Image CDN · Bento accordion',
    title: 'Clicking down the accordion: each answer slides open as the last one closes',
    duration: 7.6, target: card('accordion'), isolate: [card('accordion')],
    cursorFrom: [400, 1140],
    cursor: [
      // where each summary sits when it's clicked (they slide up as answers open)
      { t: 1.4, to: [291, 577], move: 1.1, click: true },
      { t: 3.4, to: [291, 633], move: 0.8, click: true },
      { t: 5.4, to: [291, 689], move: 0.8, click: true },
    ],
    views: {
      landscape: [{ t: 0, el: card('accordion'), pad: 60 }],
      portrait: [{ t: 0, el: card('accordion'), pad: 20 }],
      square: [{ t: 0, el: card('accordion'), pad: 30 }],
    },
  },
  {
    ...bentoBase, label: 'Image CDN · Ops marquee',
    title: 'Hovering the operations card sets its four rows of pills scrolling',
    duration: 8, target: card('ops'), isolate: [card('ops')], plain: PLAIN,
    cursorFrom: [700, 1140],
    cursor: [
      { t: 1.2, to: card('ops'), at: [0.45, 0.42], move: 1.1 },
      { t: 3.6, to: card('ops'), at: [0.6, 0.36], move: 2.2 },
      { t: 5.6, to: card('ops'), at: [0.52, 0.5], move: 1.8 },
      { t: 6.6, to: [1036, 1140], move: 1.0 },
    ],
    views: {
      landscape: [{ t: 0, el: card('ops'), pad: 60 }],
      // the rows fill the card's width, so the close-up is the card itself
      // (any closer cuts its copy off at both sides)
      portrait: [{ t: 0, el: card('ops'), pad: 16 }],
      square: [{ t: 0, el: card('ops'), pad: 20 }],
    },
  },
  {
    ...bentoBase, label: 'Image CDN · Variant fan',
    title: 'Hovering the variants card fires pulses down the branches on both sides',
    duration: 8, target: card('fan'), isolate: [card('fan')], plain: PLAIN,
    cursorFrom: [1036, 1140],
    cursor: [
      { t: 1.0, to: card('fan'), at: [0.62, 0.5], move: 1.0 },
      { t: 4.0, to: card('fan'), at: [0.56, 0.42], move: 2.4 },
      { t: 6.8, to: card('fan'), at: [0.62, 0.48], move: 2.4 },
    ],
    views: {
      landscape: [{ t: 0, el: card('fan'), pad: 60 }],
      portrait: [{ t: 0, el: card('fan'), pad: 16 }],
      square: [{ t: 0, el: card('fan'), pad: 20 }],
    },
  },
];

// ----------------------------------------------------------- QuickStart
// "Set up in an afternoon": hovering an underlined part of a URL shows what it
// is; the tabs switch between the URL API and the <uc-img> component.

const step = (n, title) => `#quickstart-panel-url-api .quickstart__step:nth-child(${n}) [data-annot-title="${title}"]`;
const ucImg = (title) => `#quickstart-panel-uc-img [data-annot-title="${title}"]`;
const qsTabs = '[role=tablist][aria-label="Integration method"]';

const quickstart = [
  {
    kind: 'site', page: 'image-cdn', label: 'Image CDN · Quick start',
    title: 'Hovering the URL parts explains each; then the uc-img tab',
    duration: 11, target: '.quickstart', isolate: ['.quickstart', qsTabs],
    cursorFrom: [300, 960],
    cursor: [
      { t: 1.1, to: step(1, 'Project subdomain'), move: 1.0 },
      { t: 2.5, to: step(1, 'UUID'), at: [0.4, 0.5] },
      { t: 3.9, to: step(2, 'Resize') },
      { t: 5.3, to: step(3, 'Enhance') },
      { t: 6.9, to: '#quickstart-tab-uc-img', move: 0.9, click: true },
      { t: 8.4, to: ucImg('Breakpoints'), move: 0.8 },
      { t: 9.8, to: ucImg('CDN operation') },
    ],
    views: {
      landscape: [{ t: 0, el: ['.quickstart__panels', qsTabs], pad: 50 }],
      // step 1 while the cursor comes in, then follow it (tooltips sit above)
      portrait: [
        { t: 0, rect: [0, 116, 480, 380], pad: 0 },
        { t: 1.5, cursor: true, w: 480, dy: -40, lag: 0.3, dur: 0.6 },
      ],
      square: [
        { t: 0, rect: [0, 66, 640, 480], pad: 0 },
        { t: 1.5, cursor: true, w: 640, dy: -40, lag: 0.3, dur: 0.6 },
      ],
    },
  },
];

export default [...demo, ...dials, ...bento, ...quickstart];

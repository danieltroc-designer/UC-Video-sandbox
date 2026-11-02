// uploadcare.com/products/file-uploader

// The player's `isolate` sets `visibility: visible` on every element inside the
// component, which also shows the parts these components hide with
// `visibility: hidden` (the configurator's idle mocks, closed pickers). So the
// cards here isolate by inheritance instead: only the component is visible,
// and what it hides itself stays hidden.
const only = (...sels) => `body { visibility: hidden; } ${sels.join(', ')} { visibility: visible; }`;

// Extra css for some shapes only (the player's `css` applies to all of them).
// Runs in the deck's own window, whose #stage knows the shape being played.
const cssFor = (byFormat) => (doc) => {
  const css = byFormat[document.getElementById('stage')?.dataset.format];
  if (css) doc.head.append(Object.assign(doc.createElement('style'), { textContent: css }));
};

// ---------------------------------------------------------- configurator
//
// The UploadConfigurator (section.uploader-cfg) cycles through its five
// modes on its own, every 3.5 s, swapping a mock of each one into the
// preview and replaying its scene (uploaderScenes.js). Any pointerdown on
// the controls stops the cycle and mounts the real uploader instead.

const CFG = '[data-uploader-configurator]';
const MODES = ['plain', 'compact', 'menu', 'toolbar', 'minimal'];
const modeItem = (m) => `.uploader-cfg .seg--modes .seg__item:nth-child(${MODES.indexOf(m) + 2})`;

// Stops the site's own 3.5 s cycle, the way a click on the controls would.
const stopCycle = (doc, win) => {
  doc.querySelector(`${CFG} [data-controls]`).dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true }));
};

// The page has only just loaded at 0 s, so the configurator is still running
// its entrance (the preview panel's uc-panel-in, the first mock's fade-in, a
// few transitions). On the site that's long over by the time you scroll here:
// end it, so the first frame is settled.
const settle = (doc, names = ['uc-panel-in', 'uc-mock-in']) => {
  for (const a of doc.querySelector(CFG).getAnimations({ subtree: true })) {
    if (a.transitionProperty) a.cancel();
    // played out, holding its end state (the panel only shows through its fill)
    else if (names.includes(a.animationName)) a.effect.target.style.animationDelay = '-60s';
  }
};

// Runs the mode cycle at our own pace: the site's interval step (uploadConfigurator
// u()), called from the card's timeline. `dwell` is how long this mode stays,
// which the mode list's progress tick runs on.
const cycle = {
  start: (dwell) => (doc, win) => {
    stopCycle(doc, win);
    const root = doc.querySelector(CFG);
    root.querySelector('[data-mocks]').hidden = false;
    root.toggleAttribute('data-cycling', true);
    root.style.setProperty('--mode-dwell', `${dwell * 1000}ms`);
    settle(doc);
  },
  to: (m, dwell) => (doc, win) => {
    const root = doc.querySelector(CFG);
    const radios = [...root.querySelectorAll('input[name="mode"]')];
    const was = radios.find((r) => r.checked)?.value;
    const next = radios.find((r) => r.value === m);
    root.style.setProperty('--mode-dwell', `${dwell * 1000}ms`);
    next.checked = true;
    next.dispatchEvent(new win.Event('change', { bubbles: true }));
    const out = root.querySelector(`[data-mock="${was}"]`);
    const into = root.querySelector(`[data-mock="${m}"]`);
    out?.style.removeProperty('animation-delay');
    out?.classList.remove('is-in');
    out?.classList.add('is-out');
    into.classList.remove('is-out');
    into.classList.add('is-in');
    const scene = into.querySelector('[data-scene]')?.dataset.scene;
    if (scene) win.__uploaderScenes?.[scene]?.restart();
  },
};

// the middle of the preview, where the uploader and its modal sit (page px)
const PREVIEW_TALL = [644, 0, 520, 900];
const PREVIEW_SQ = [614, 195, 580, 580];
// the code pane's tabs (Next.js to Svelte) and the snippet's first lines
const CODE_TALL = [478, 115, 548, 670];
const CODE_SQ = [470, 110, 590, 590];

// where to click a tab or button: on its label, not its icon (the player's
// click() can't click an <svg>)
const TEXT = [0.64, 0.5];

const mock = (m, part) => `[data-mock="${m}"] ${part}`;

// how long each mode stays: long enough for its scene to finish
const DWELL = { plain: 1.8, compact: 3.0, menu: 2.0, toolbar: 2.0, minimal: 2.9 };
const AT = {};
{ let t = 0; for (const m of MODES) { AT[m] = t; t += DWELL[m]; } }

// each mode's mock, framed close for the vertical cuts
const MOCK_VIEW = {
  plain: { el: mock('plain', '.uc-dialog'), pad: 40 },
  compact: { el: mock('compact', '.composer'), pad: 60 },
  menu: { el: mock('menu', '.uc-scene'), pad: 80 },
  toolbar: { el: mock('toolbar', '.note'), pad: 40 },
  minimal: { el: mock('minimal', '.scene__panel'), pad: 50 },
};
const followModes = (padScale = 1) => MODES.map((m, i) => ({
  t: i ? AT[m] - 0.25 : 0, ...MOCK_VIEW[m], pad: MOCK_VIEW[m].pad * padScale, dur: 0.8,
}));

const configurator = [
  {
    kind: 'site', page: 'file-uploader', label: 'Uploader · Modes',
    title: 'The configurator steps through its five modes, each mock playing its own little upload',
    duration: 11.7, target: 'section.uploader-cfg', isolate: false, css: only('.uploader-cfg__inner'),
    actions: [
      { t: 0, call: cycle.start(DWELL.plain) },
      ...MODES.slice(1).map((m) => ({ t: AT[m], call: cycle.to(m, DWELL[m]) })),
    ],
    views: {
      landscape: [{ t: 0, el: '.uploader-cfg__card', pad: 50 }],
      portrait: followModes(),
      square: followModes(1.3),
    },
  },
  {
    kind: 'site', page: 'file-uploader', label: 'Uploader · Theme',
    title: 'The live uploader opens its source list, then the theme switches from dark to light',
    duration: 6.6, target: 'section.uploader-cfg', isolate: false, css: only('.uploader-cfg__inner'),
    // the real uploader from the start, not the cycling mocks
    actions: [{ t: 0, call: (doc, win) => { stopCycle(doc, win); settle(doc); } }],
    cursorFrom: [1150, 960],
    cursor: [
      { t: 1.2, to: '[data-preview-stage] uc-primary-action > button', at: [0.62, 0.5], move: 1.0, click: true },
      { t: 2.7, to: '.uploader-cfg button[aria-label="Theme"]', at: [0.14, 0.5], move: 1.0, click: true },
      { t: 3.5, to: '.uploader-cfg label:has(> input[name="theme"][value="light"])', at: [0.7, 0.5], move: 0.6, click: true },
      { t: 5.0, to: '[data-preview-stage] uc-source-btn button', at: [0.3, 0.5], move: 1.1 },
    ],
    views: {
      landscape: [{ t: 0, el: '.uploader-cfg__card', pad: 50 }],
      portrait: [
        { t: 0, rect: PREVIEW_TALL, pad: 0 },
        { t: 1.8, cursor: true, w: 480, dur: 0.9 },
        { t: 3.75, rect: PREVIEW_TALL, pad: 0, dur: 1.1 },
      ],
      square: [
        { t: 0, rect: PREVIEW_SQ, pad: 0 },
        { t: 1.8, cursor: true, w: 540, dur: 0.9 },
        { t: 3.75, rect: PREVIEW_SQ, pad: 0, dur: 1.1 },
      ],
    },
  },
  {
    kind: 'site', page: 'file-uploader', label: 'Uploader · Code',
    title: 'Switching to Code, the snippet rewrites itself per framework, then for the drop-area build',
    duration: 9.2, target: 'section.uploader-cfg', isolate: false, css: only('.uploader-cfg__inner'),
    actions: [{ t: 0, call: (doc) => settle(doc) }],
    cursorFrom: [700, 960],
    cursor: [
      { t: 1.2, to: '#uc-pane-tab-code', at: TEXT, move: 1.0, click: true },
      { t: 2.6, to: '#uc-framework-tab-react', at: TEXT, move: 0.9, click: true },
      { t: 3.9, to: '#uc-framework-tab-js', at: TEXT, move: 0.6, click: true },
      { t: 5.2, to: '#uc-framework-tab-svelte', at: TEXT, move: 0.6, click: true },
      // regular → minimal build: the tag, the stylesheet and the button lines change
      { t: 6.8, to: modeItem('minimal'), at: [0.55, 0.35], move: 1.1, click: true },
    ],
    views: {
      landscape: [{ t: 0, el: '.uploader-cfg__card', pad: 50 }],
      // the controls, then the snippet's tabs and first lines, then back for the mode
      portrait: [
        { t: 0, el: '.uploader-cfg__controls', pad: 100 },
        { t: 1.5, rect: CODE_TALL, pad: 0, dur: 1.0 },
        { t: 5.7, el: '.uploader-cfg__controls', pad: 100, dur: 0.9 },
        { t: 7.05, rect: CODE_TALL, pad: 0, dur: 0.9 },
      ],
      square: [
        { t: 0, el: '.uploader-cfg__controls', pad: 120 },
        { t: 1.5, rect: CODE_SQ, pad: 0, dur: 1.0 },
        { t: 5.7, el: '.uploader-cfg__controls', pad: 120, dur: 0.9 },
        { t: 7.05, rect: CODE_SQ, pad: 0, dur: 0.9 },
      ],
    },
  },
];

// ------------------------------------------------------------------ bento

const SOURCES = '.up-bento__sources-card';
const EDITOR = '.up-bento__editor-card';

// the close-ups crop through the card's heading, so they leave it out
const NO_HEADING = `${EDITOR} .up-bento__text { opacity: 0; }`;

const bento = [
  {
    // the ticker steps every 2 s while it's in view
    kind: 'site', page: 'file-uploader', label: 'Uploader · Sources',
    title: 'The sources ticker rolls from device to camera, Dropbox, Drive and Photos',
    duration: 9.2, target: SOURCES, isolate: false, css: only(SOURCES),
    // animation only: just the ticker, framed whole in every shape
    plain: {
      hide: [`${SOURCES} .up-bento__text`],
      views: {
        landscape: [{ t: 0, el: SOURCES, pad: 60, clamp: false }],
        portrait: [{ t: 0, el: SOURCES, pad: 20, clamp: false }],
        square: [{ t: 0, el: SOURCES, pad: 30, clamp: false }],
      },
    },
    views: {
      // clamp: false keeps the card centred though it sits at the page's left edge
      landscape: [{ t: 0, el: [`${SOURCES} .up-bento__text`, '.sources-art__label'], pad: 60, clamp: false }],
      portrait: [{ t: 0, el: SOURCES, pad: 20 }],
      square: [{ t: 0, el: [`${SOURCES} .up-bento__text`, '.sources-art__label'], pad: 40 }],
    },
  },
  {
    // hovering the card plays the editor scene: crop → tuning → filters → crop
    kind: 'site', page: 'file-uploader', label: 'Uploader · Editor',
    title: 'Hovering the editor card runs its tabs: crop, then tuning, then filters, and back',
    // the scene loops 4.08 s after the hover starts (at ~0.85 s): this ends on
    // the settled crop it started on
    duration: 4.8, target: EDITOR, isolate: false, css: only(EDITOR),
    plain: { hide: [`${EDITOR} .up-bento__text`] },
    actions: [{ t: 0, call: cssFor({ portrait: NO_HEADING, square: NO_HEADING }) }],
    cursorFrom: [1100, 980],
    cursor: [
      { t: 0.5, to: [1150, 900], move: 0.5 },
      { t: 1.3, to: EDITOR, at: [0.62, 0.55], move: 0.8 },
      { t: 3.1, to: EDITOR, at: [0.55, 0.72], move: 1.6 },
      { t: 4.7, to: EDITOR, at: [0.6, 0.6], move: 1.5 },
    ],
    views: {
      landscape: [{ t: 0, el: EDITOR, pad: 50, clamp: false }],
      // the photo and the toolbar, centred on the toolbar's tabs
      portrait: [{ t: 0, rect: [693, 0, 520, 900], pad: 0 }],
      square: [{ t: 0, rect: [673, 215, 560, 560], pad: 0 }],
    },
  },
];

export default [...configurator, ...bento];

// uploadcare.com/cdn/video-cdn

// The player's `isolate` sets `visibility: visible` on every element inside the
// component, which also shows what the component hides itself. These cards
// isolate by inheritance instead (see file-uploader.js).
const only = (...sels) => `body { visibility: hidden; } ${sels.join(', ')} { visibility: visible; }`;

// ------------------------------------------------------------------- hero
//
// A <uc-video> (HLS through video.js) loops behind a panel that "transcodes"
// it: the canvas redraws the playing video as pixels, coarser or finer as the
// active rendition steps SD → HD → FHD → 4K every 1.2 s. render/clock.js holds
// the <video> and seeks it to virtual time, and the renderer waits for each seek.

const HERO = 'section.video-section';
const PANEL = '.video-section__panel';

const hero = {
  kind: 'site', page: 'video-cdn', label: 'Video CDN · Player',
  title: 'The video plays while the panel pixelates it, rendition by rendition from SD to 4K',
  // two rounds of SD → 4K; at 9.6 s it is back on SD, where it started
  duration: 9.6, target: HERO, isolate: false, css: only(HERO),
  views: {
    landscape: [{ t: 0, el: ['.video-section__stage', PANEL], pad: 40 }],
    // the source and the canvas first, then the canvas and the renditions, the video below
    portrait: [
      { t: 0, rect: [630, 40, 470, 756], pad: 0 },
      { t: 3.0, rect: [839, 40, 430, 756], pad: 0, dur: 1.4 },
    ],
    square: [
      { t: 0, rect: [630, 70, 470, 470], pad: 0 },
      { t: 3.0, rect: [839, 70, 430, 430], pad: 0, dur: 1.4 },
    ],
  },
};

// ------------------------------------------------------- upload → playback
//
// The source modal (static, with a file being dragged in), a pixel donut that
// twinkles between the columns, and a second <uc-video> playing with controls.

const PLAYBACK = 'section.upload-playback';
const UPLOADER = `${PLAYBACK} .uploader`;
const step = (n) => `${PLAYBACK} .step:nth-child(${n})`;

const playback = {
  kind: 'site', page: 'video-cdn', label: 'Video CDN · Upload to playback',
  title: 'From the upload modal across to the player, where the zebra clip streams',
  duration: 8, target: PLAYBACK, isolate: false, css: only(PLAYBACK),
  views: {
    landscape: [{ t: 0, el: ['.upload-playback__grid', '.steps'], pad: 50 }],
    // the modal with its step, then across the donut to the player and its step
    portrait: [
      { t: 0, el: [UPLOADER, '.uploader__preview-wrap', step(1)], pad: 30 },
      { t: 2.6, rect: [826, 0, 520, 900], pad: 0, dur: 1.6 },
    ],
    square: [
      { t: 0, el: [UPLOADER, '.uploader__preview-wrap'], pad: 30 },
      { t: 2.6, rect: [786, 98, 560, 560], pad: 0, dur: 1.6 },
    ],
  },
};

// ---------------------------------------------------------- transcoding
//
// section.video-transcoding: a tall scheme (master file → renditions →
// viewers) with flowing connectors, and six callouts left and right of it that
// ScrollTrigger fades in and out as they pass through the viewport. The card
// scrolls a callout at a time, pausing on each, while the frame holds still
// (rect views are viewport coordinates, so the page moves through them).

const VT = '[data-vt-root]';
// callouts are ~179 px apart, alternating left and right of the scheme
const STEP = 179;
const steps = [1.2, 3.0, 4.8, 6.6, 8.4].map((t) => ({ t, scroll: STEP, dur: 1.1 }));
// a close-up on one side: the callout and the half of the scheme next to it
const LEFT = { rect: [140, 0, 506, 900], pad: 0 };
const RIGHT = { rect: [794, 0, 506, 900], pad: 0 };
const LEFT_SQ = { rect: [140, 197, 506, 506], pad: 0 };
const RIGHT_SQ = { rect: [794, 197, 506, 506], pad: 0 };
const zigzag = (l, r) => [
  { t: 0, ...l },
  ...steps.map((s, i) => ({ t: s.t + 0.05, ...(i % 2 ? l : r), dur: 1.05 })),
];

const transcoding = {
  kind: 'site', page: 'video-cdn', label: 'Video CDN · Transcoding',
  title: 'Scrolling down the transcoding scheme, each callout lights up as it passes',
  // the section's heading sits right above the scheme: out of this one
  duration: 10.6, target: `${VT} [data-vt-callout]`, isolate: false,
  css: `${only(VT)} ${VT} .section-heading { visibility: hidden; }`,
  actions: steps,
  views: {
    landscape: [{ t: 0, rect: [120, 90, 1200, 720], pad: 0 }],
    portrait: zigzag(LEFT, RIGHT),
    square: zigzag(LEFT_SQ, RIGHT_SQ),
  },
};

// ---------------------------------------------------------- industries
//
// An accordion: a click opens an industry (its tags and link fade in) and
// cross-fades the photo beside it. Hover only brightens the heading.

const IND = 'section.industries';
const trigger = (n) => `${IND} [data-ind-item]:nth-child(${n}) [data-ind-trigger]`;

const industries = {
  kind: 'site', page: 'video-cdn', label: 'Video CDN · Industries',
  title: 'The cursor opens real estate, then e-commerce, then e-learning again; the photo follows',
  duration: 8, target: IND, isolate: false, css: only(IND),
  cursorFrom: [380, 980],
  cursor: [
    { t: 1.3, to: trigger(2), at: [0.3, 0.5], move: 1.1, click: true },
    { t: 3.9, to: trigger(3), at: [0.3, 0.5], move: 0.9, click: true },
    { t: 6.4, to: trigger(1), at: [0.3, 0.5], move: 1.0, click: true },
  ],
  views: {
    landscape: [{ t: 0, el: '.industries__card', pad: 50 }],
    // the accordion, up to the photo's edge (the photo itself is in the 16:9
    // cut, and peeks in beside the list in 1:1)
    portrait: [{ t: 0, rect: [96, 170, 422, 560], pad: 0 }],
    square: [{ t: 0, el: '.industries__list', pad: 40 }],
  },
};

export default [hero, playback, transcoding, industries];

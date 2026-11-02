import { REACTIONS, ENTRANCES, EXITS, mascotIcon } from './mascot.js';

export const FORMATS = {
  '1920x1080': { label: '16:9 · 1080p', w: 1920, h: 1080 },
  '3840x2160': { label: '16:9 · 4K', w: 3840, h: 2160 },
  '1080x1920': { label: '9:16 · Vertical', w: 1080, h: 1920 },
  '1080x1080': { label: '1:1 · Square', w: 1080, h: 1080 },
  '1080x1350': { label: '4:5 · Portrait', w: 1080, h: 1350 },
};

export const FPS_OPTIONS = [24, 25, 30, 50, 60];

export const DEFAULTS = {
  // Output
  format: '1920x1080',
  fps: 60,

  // Intro, outro, mascot, library or shots (switched in the top bar)
  mode: 'intro',

  // Mascot: the pixel character from uploadcare.com, one reaction per clip.
  // It keeps its own format, square unless changed.
  mascotFormat: '1080x1080',
  mascotReaction: 'wave',
  mascotCaption: 'Hello!',
  showCaption: false,
  mascotFlip: false,
  mascotEntrance: 'jump',
  mascotExit: 'none',
  mascotLength: 4,
  mascotSpeed: 1,
  mascotBackground: 'black',
  mascotColor: '#ffcf3e',
  mascotBgColor: '#ffffff',
  mascotSize: 1,
  mascotPlace: 'bottom',

  // Library: booth-deck cards, previewed live and rendered by the local renderer
  libDeck: 'ecommerce-expo',
  libCard: 0,
  libFormat: 'landscape',
  libScale: 1,
  libCamera: false, // film the card's 16:9 layout on an angled screen (library/camera.html)
  // Shots: uploadcare.com's animations, the same panel fixed on library/shots
  shotsCard: 0,
  shotsFormat: 'portrait',

  // Content
  title: 'The infrastructure\nbehind every file',
  subtitle: 'Upload, process and deliver any file at scale.\nOne API. Global CDN. Zero infrastructure.',
  url: 'uploadcare.com',
  showLogo: true,
  showTitle: true,
  showSubtitle: false,
  showUrl: true,
  outroTagline: 'The infrastructure\nbehind every file',
  showTagline: true,
  primaryLabel: 'Start free',
  showPrimary: true,
  secondaryLabel: 'Get a demo',
  showSecondary: true,

  // Outro style — buttons follow the 2026 design system
  outroBackground: 'black',
  buttonScale: 1.75,
  primaryColor: '#002fff',
  primaryText: '#ffffff',
  secondaryColor: '#232323',
  secondaryText: '#ffffff',
  outroUrlColor: '#8a8a96',

  // Typography (sizes are px at 1080p)
  titleSize: 116,
  titleTracking: -2.5,
  titleLeading: 1.04,
  titleTop: '#ffffff',
  titleBottom: '#b2b2bf',
  accent: '#ffcf3e',
  subtitleSize: 34,
  subtitleWeight: 500,
  subtitleColor: '#8f8f9c',
  urlSize: 24,
  urlStyle: 'pill',
  urlColor: '#e8e8ee',

  // Logo
  logoIntro: 700,
  logoFinal: 290,
  glyphPattern: 'dissolve',
  glyphStyle: 'fill',
  glyphGhost: '#323233',
  glyphColor: '#ffcf3e',
  wordColor: '#ffffff',
  glow: 0.5,

  // Motion
  fitLength: true,
  length: 4,
  outroLength: 5,
  outroEndFade: false,
  speed: 1,
  stagger: 1,
  blur: 1,
  motionBlur: 1,
  rise: 1,
  hold: 2,
  outro: true,

  // Music
  musicTrack: 'none',
  musicVolume: 1,

  // Layout
  spacing: 1,
  offsetY: 0,

  // Background — the image's own look is spread in from BACKGROUNDS below.
  bgPreset: 'silk',
  revealStyle: 'soft',
  revealCorner: 'bottom-left',
  revealDuration: 1.7,
};

// Built-in background images, each with the look it was tuned for (the values
// of the Background section). Switching image swaps its look in.
export const BACKGROUNDS = {
  streaks: {
    label: 'Streaks',
    src: 'assets/background.webp',
    look: {
      bgBrightness: 0.7,
      bgFlow: 1.55,
      bgFlowSpeed: 0.25,
      bgZoom: 25,
      bgDrift: 0.85,
      bgFlip: false,
      shimmer: 0.1,
      shimmerSpeed: 0.9,
      shimmerAngle: 0,
      spotlight: 0,
      spotColor: '#d9dcf0',
      vignette: 0.39,
      grain: 0.07,
    },
  },
  silk: {
    label: 'Silk',
    src: 'assets/background-silk.webp',
    look: {
      bgBrightness: 0.85,
      bgFlow: 1.2,
      bgFlowSpeed: 0.3,
      bgZoom: 12,
      bgDrift: 0.7,
      bgFlip: false,
      shimmer: 0.16,
      shimmerSpeed: 0.5,
      shimmerAngle: 32,
      spotlight: 0,
      spotColor: '#d9dcf0',
      vignette: 0.45,
      grain: 0.04,
    },
  },
};

Object.assign(DEFAULTS, BACKGROUNDS[DEFAULTS.bgPreset].look);

// Built-in soundtracks (files in assets/music).
export const TRACKS = {
  none: { label: 'None' },
};

// Keys that belong to a background's look.
export const LOOK_KEYS = Object.keys(BACKGROUNDS.streaks.look);

const titles = (s) => s.mode !== 'mascot';

// Sidebar schema. `toggle` puts an on/off switch in the field header.
export const SECTIONS = [
  {
    id: 'mascot',
    title: 'Mascot',
    when: (s) => s.mode === 'mascot',
    controls: [
      { key: 'mascotReaction', type: 'tiles', label: 'Reaction', icon: mascotIcon,
        options: Object.entries(REACTIONS).map(([id, r]) => [id, r.label]) },
      { key: 'mascotCaption', type: 'text', label: 'Caption', toggle: 'showCaption',
        hint: 'A pixel speech bubble, one line. Letters, numbers and ! ? . , - + : / & # @ % ♥' },
      { key: 'mascotFlip', type: 'switch', label: 'Face right' },
    ],
  },
  {
    id: 'mascotMotion',
    title: 'Motion',
    when: (s) => s.mode === 'mascot',
    controls: [
      { key: 'mascotEntrance', type: 'segmented', label: 'Entrance', options: Object.entries(ENTRANCES) },
      { key: 'mascotExit', type: 'segmented', label: 'Exit', options: Object.entries(EXITS) },
      { key: 'mascotLength', type: 'range', label: 'Length', min: 1, max: 15, step: 0.5, unit: 's',
        hint: 'Rounded to a whole number of loops, so the clip repeats without a jump.' },
      { key: 'mascotSpeed', type: 'range', label: 'Speed', min: 0.5, max: 2, step: 0.05, unit: '×' },
    ],
  },
  {
    id: 'mascotLook',
    title: 'Look',
    when: (s) => s.mode === 'mascot',
    controls: [
      { key: 'mascotBackground', type: 'segmented', label: 'Background',
        options: [['black', 'Black'], ['inverted', 'Inverted'], ['green', 'Green'], ['custom', 'Custom']],
        hint: 'Green is a chroma-key screen: key it out in CapCut, Edits or Premiere to put him over your own footage.' },
      { key: 'mascotColor', type: 'color', label: 'Mascot color' },
      { key: 'mascotBgColor', type: 'color', label: 'Background color', when: (s) => s.mascotBackground === 'custom' },
      { key: 'mascotSize', type: 'range', label: 'Size', min: 0.5, max: 2, step: 0.05, unit: '×' },
      { key: 'mascotPlace', type: 'segmented', label: 'Position', options: [['bottom', 'On the bottom'], ['center', 'Centered']] },
    ],
  },
  {
    id: 'mascotExport',
    title: 'Transparent export',
    when: (s) => s.mode === 'mascot',
    controls: [
      { key: 'mascotDownload', type: 'buttons', label: 'No background',
        options: [['prores', 'MOV · ProRes'], ['hevc', 'MOV · HEVC'], ['gif', 'GIF'], ['lottie', 'Lottie']],
        hint: 'To lay over your own video. MOV is what editors want: ProRes 4444 for Premiere, Final Cut, DaVinci or CapCut desktop, HEVC (much smaller) for iPhone and Apple apps — both encode on your Mac (npm start) and save to Downloads. GIF suits chats and sticker apps; Lottie (JSON) is vector, for websites and apps.' },
    ],
  },
  {
    id: 'content',
    title: 'Content',
    when: titles,
    controls: [
      { key: 'title', type: 'textarea', label: 'Title', toggle: 'showTitle', rows: 2, when: (s) => s.mode === 'intro',
        hint: 'Line breaks are kept. Wrap words in *asterisks* to highlight them.' },
      { key: 'subtitle', type: 'textarea', label: 'Subtitle', toggle: 'showSubtitle', rows: 3, when: (s) => s.mode === 'intro' },
      { key: 'outroTagline', type: 'textarea', label: 'Tagline', toggle: 'showTagline', rows: 2, when: (s) => s.mode === 'outro',
        hint: 'Uses the title typography. Line breaks are kept.' },
      { key: 'primaryLabel', type: 'text', label: 'Primary button', toggle: 'showPrimary', when: (s) => s.mode === 'outro' },
      { key: 'secondaryLabel', type: 'text', label: 'Secondary button', toggle: 'showSecondary', when: (s) => s.mode === 'outro' },
      { key: 'url', type: 'text', label: 'URL', toggle: 'showUrl' },
      { key: 'showLogo', type: 'switch', label: 'Logo intro', when: (s) => s.mode === 'intro' },
    ],
  },
  {
    id: 'motion',
    title: 'Motion',
    when: titles,
    controls: [
      { key: 'fitLength', type: 'switch', label: 'Fixed length' },
      { key: 'length', type: 'range', label: 'Length', min: 3, max: 15, step: 0.5, unit: 's', when: (s) => s.fitLength && s.mode === 'intro',
        hint: 'Everything is paced to end exactly on this length, with a short hold before the fade.' },
      { key: 'outroLength', type: 'range', label: 'Length', min: 3, max: 15, step: 0.5, unit: 's', when: (s) => s.fitLength && s.mode === 'outro',
        hint: 'Everything is paced to end exactly on this length; the last part holds the final frame.' },
      { key: 'speed', type: 'range', label: 'Speed', min: 0.5, max: 2, step: 0.05, unit: '×', when: (s) => !s.fitLength },
      { key: 'stagger', type: 'range', label: 'Stagger', min: 0.2, max: 2.5, step: 0.05, unit: '×' },
      { key: 'blur', type: 'range', label: 'Focus blur', min: 0, max: 2.5, step: 0.05, unit: '×' },
      { key: 'motionBlur', type: 'range', label: 'Motion blur', min: 0, max: 2.5, step: 0.05, unit: '×' },
      { key: 'rise', type: 'range', label: 'Rise distance', min: 0, max: 2.5, step: 0.05, unit: '×' },
      { key: 'hold', type: 'range', label: 'Hold', min: 0, max: 8, step: 0.1, unit: 's', when: (s) => !s.fitLength },
      { key: 'outro', type: 'switch', label: 'Fade out at end', when: (s) => s.mode === 'intro' },
      { key: 'outroEndFade', type: 'switch', label: 'Fade out at end', when: (s) => s.mode === 'outro' },
    ],
  },
  {
    id: 'music',
    title: 'Music',
    controls: [
      { key: 'musicTrack', type: 'select', label: 'Track',
        options: Object.entries(TRACKS).map(([id, tr]) => [id, tr.label]) },
      { key: 'musicFile', type: 'upload', accept: 'audio/*', label: 'Your own audio' },
      { key: 'musicVolume', type: 'range', label: 'Volume', min: 0, max: 1.5, step: 0.05, unit: '×',
        hint: 'Plays with the preview and is mixed into the exported MP4, fading out at the end.' },
    ],
  },
  {
    id: 'outro',
    title: 'Outro style',
    when: (s) => s.mode === 'outro',
    controls: [
      { key: 'outroBackground', type: 'segmented', label: 'Background', options: [['black', 'Black'], ['image', 'Image']] },
      { key: 'buttonScale', type: 'range', label: 'Button size', min: 1, max: 3.5, step: 0.05, unit: '×',
        hint: 'Buttons follow the 2026 design system: pill, Commit Mono, 40px tall at 1×.' },
      { key: 'primaryColor', type: 'color', label: 'Primary button', pair: 'primaryText' },
      { key: 'secondaryColor', type: 'color', label: 'Secondary button', pair: 'secondaryText' },
      { key: 'outroUrlColor', type: 'color', label: 'URL color' },
    ],
  },
  {
    id: 'logo',
    title: 'Logo',
    when: (s) => s.mode === 'outro' || (titles(s) && s.showLogo),
    controls: [
      { key: 'glyphPattern', type: 'select', label: 'Mark animation',
        options: [['dissolve', 'Dissolve up'], ['ripple', 'Ripple'], ['sweep', 'Sweep across'], ['spin', 'Spin'], ['random', 'Scatter']] },
      { key: 'glyphStyle', type: 'segmented', label: 'Square style', options: [['fill', 'Fill'], ['pop', 'Pop']] },
      { key: 'glyphGhost', type: 'color', label: 'Empty square color', when: (s) => s.glyphStyle === 'fill' },
      { key: 'logoIntro', type: 'range', label: 'Intro width', min: 300, max: 1000, step: 10, unit: 'px' },
      { key: 'logoFinal', type: 'range', label: 'Final width', min: 140, max: 600, step: 5, unit: 'px' },
      { key: 'glow', type: 'range', label: 'Mark glow', min: 0, max: 1.5, step: 0.05 },
      { key: 'glyphColor', type: 'color', label: 'Mark color' },
      { key: 'wordColor', type: 'color', label: 'Wordmark color' },
    ],
  },
  {
    id: 'type',
    title: 'Typography',
    when: titles,
    controls: [
      { key: 'titleSize', type: 'range', label: 'Title size', min: 48, max: 200, step: 1, unit: 'px' },
      { key: 'titleTracking', type: 'range', label: 'Title tracking', min: -6, max: 4, step: 0.1, unit: '%' },
      { key: 'titleLeading', type: 'range', label: 'Title line height', min: 0.85, max: 1.4, step: 0.01 },
      { key: 'titleTop', type: 'color', label: 'Title gradient', pair: 'titleBottom' },
      { key: 'accent', type: 'color', label: 'Highlight' },
      { key: 'subtitleSize', type: 'range', label: 'Subtitle size', min: 18, max: 64, step: 1, unit: 'px', when: (s) => s.mode === 'intro' },
      { key: 'subtitleWeight', type: 'segmented', label: 'Subtitle weight', when: (s) => s.mode === 'intro',
        options: [[400, 'Regular'], [500, 'Medium'], [600, 'Semibold']] },
      { key: 'subtitleColor', type: 'color', label: 'Subtitle color', when: (s) => s.mode === 'intro' },
      { key: 'urlSize', type: 'range', label: 'URL size', min: 14, max: 48, step: 1, unit: 'px' },
      { key: 'urlStyle', type: 'segmented', label: 'URL style', options: [['pill', 'Pill'], ['plain', 'Plain']], when: (s) => s.mode === 'intro' },
    ],
  },
  {
    id: 'layout',
    title: 'Layout',
    when: titles,
    controls: [
      { key: 'spacing', type: 'range', label: 'Spacing', min: 0.4, max: 2, step: 0.05, unit: '×' },
      { key: 'offsetY', type: 'range', label: 'Vertical offset', min: -300, max: 300, step: 2, unit: 'px' },
    ],
  },
  {
    id: 'background',
    title: 'Background',
    when: (s) => titles(s) && !(s.mode === 'outro' && s.outroBackground === 'black'),
    controls: [
      { key: 'bgPreset', type: 'segmented', label: 'Image',
        options: Object.entries(BACKGROUNDS).map(([id, b]) => [id, b.label]) },
      { key: 'bgImage', type: 'upload', accept: 'image/*', label: 'Your own image' },
      { key: 'revealStyle', type: 'segmented', label: 'Reveal',
        options: [['soft', 'Soft'], ['fade', 'Fade']] },
      { key: 'revealCorner', type: 'select', label: 'Reveal from', when: (s) => s.revealStyle !== 'fade',
        options: [['bottom-left', 'Bottom left'], ['top-left', 'Top left'], ['top-right', 'Top right'], ['bottom-right', 'Bottom right']] },
      { key: 'revealDuration', type: 'range', label: 'Reveal duration', min: 0.4, max: 4, step: 0.05, unit: 's' },
      { key: 'bgBrightness', type: 'range', label: 'Brightness', min: 0.3, max: 2, step: 0.01 },
      { key: 'bgFlow', type: 'range', label: 'Shape flow', min: 0, max: 3, step: 0.05, unit: '×' },
      { key: 'bgFlowSpeed', type: 'range', label: 'Flow speed', min: 0.2, max: 3, step: 0.05, unit: '×' },
      { key: 'bgZoom', type: 'range', label: 'Camera push', min: 0, max: 25, step: 0.5, unit: '%' },
      { key: 'bgDrift', type: 'range', label: 'Camera drift', min: 0, max: 3, step: 0.05, unit: '×' },
      { key: 'bgFlip', type: 'switch', label: 'Mirror' },
      { key: 'shimmer', type: 'range', label: 'Light sweep', min: 0, max: 1.5, step: 0.01 },
      { key: 'shimmerSpeed', type: 'range', label: 'Sweep speed', min: 0.2, max: 3, step: 0.05, unit: '×' },
      { key: 'shimmerAngle', type: 'range', label: 'Sweep angle', min: -60, max: 60, step: 1, unit: '°' },
      { key: 'spotlight', type: 'range', label: 'Spotlight', min: 0, max: 1.5, step: 0.01 },
      { key: 'spotColor', type: 'color', label: 'Spotlight color' },
      { key: 'vignette', type: 'range', label: 'Vignette', min: 0, max: 1, step: 0.01 },
      { key: 'grain', type: 'range', label: 'Film grain', min: 0, max: 0.3, step: 0.005 },
    ],
  },
];

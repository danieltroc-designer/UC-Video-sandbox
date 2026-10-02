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

  // Content
  title: 'The infrastructure\nbehind every file',
  subtitle: 'Upload, process and deliver any file at scale.\nOne API. Global CDN. Zero infrastructure.',
  url: 'uploadcare.com',
  showLogo: true,
  showTitle: true,
  showSubtitle: false,
  showUrl: true,

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
  speed: 1,
  stagger: 1,
  blur: 1,
  motionBlur: 1,
  rise: 1,
  hold: 2,
  outro: true,

  // Layout
  spacing: 1,
  offsetY: 0,

  // Background
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
};

// Sidebar schema. `toggle` puts an on/off switch in the field header.
export const SECTIONS = [
  {
    id: 'content',
    title: 'Content',
    controls: [
      { key: 'title', type: 'textarea', label: 'Title', toggle: 'showTitle', rows: 2,
        hint: 'Line breaks are kept. Wrap words in *asterisks* to highlight them.' },
      { key: 'subtitle', type: 'textarea', label: 'Subtitle', toggle: 'showSubtitle', rows: 3 },
      { key: 'url', type: 'text', label: 'URL', toggle: 'showUrl' },
      { key: 'showLogo', type: 'switch', label: 'Logo intro' },
    ],
  },
  {
    id: 'motion',
    title: 'Motion',
    controls: [
      { key: 'speed', type: 'range', label: 'Speed', min: 0.5, max: 2, step: 0.05, unit: '×' },
      { key: 'stagger', type: 'range', label: 'Stagger', min: 0.2, max: 2.5, step: 0.05, unit: '×' },
      { key: 'blur', type: 'range', label: 'Focus blur', min: 0, max: 2.5, step: 0.05, unit: '×' },
      { key: 'motionBlur', type: 'range', label: 'Motion blur', min: 0, max: 2.5, step: 0.05, unit: '×' },
      { key: 'rise', type: 'range', label: 'Rise distance', min: 0, max: 2.5, step: 0.05, unit: '×' },
      { key: 'hold', type: 'range', label: 'Hold', min: 0, max: 8, step: 0.1, unit: 's' },
      { key: 'outro', type: 'switch', label: 'Fade-out outro' },
    ],
  },
  {
    id: 'logo',
    title: 'Logo',
    when: (s) => s.showLogo,
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
    controls: [
      { key: 'titleSize', type: 'range', label: 'Title size', min: 48, max: 200, step: 1, unit: 'px' },
      { key: 'titleTracking', type: 'range', label: 'Title tracking', min: -6, max: 4, step: 0.1, unit: '%' },
      { key: 'titleLeading', type: 'range', label: 'Title line height', min: 0.85, max: 1.4, step: 0.01 },
      { key: 'titleTop', type: 'color', label: 'Title gradient', pair: 'titleBottom' },
      { key: 'accent', type: 'color', label: 'Highlight' },
      { key: 'subtitleSize', type: 'range', label: 'Subtitle size', min: 18, max: 64, step: 1, unit: 'px' },
      { key: 'subtitleWeight', type: 'segmented', label: 'Subtitle weight', options: [[400, 'Regular'], [500, 'Medium'], [600, 'Semibold']] },
      { key: 'subtitleColor', type: 'color', label: 'Subtitle color' },
      { key: 'urlSize', type: 'range', label: 'URL size', min: 14, max: 48, step: 1, unit: 'px' },
      { key: 'urlStyle', type: 'segmented', label: 'URL style', options: [['pill', 'Pill'], ['plain', 'Plain']] },
    ],
  },
  {
    id: 'layout',
    title: 'Layout',
    controls: [
      { key: 'spacing', type: 'range', label: 'Spacing', min: 0.4, max: 2, step: 0.05, unit: '×' },
      { key: 'offsetY', type: 'range', label: 'Vertical offset', min: -300, max: 300, step: 2, unit: 'px' },
    ],
  },
  {
    id: 'background',
    title: 'Background',
    controls: [
      { key: 'bgImage', type: 'image', label: 'Image' },
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

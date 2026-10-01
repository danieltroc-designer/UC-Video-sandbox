# Uploadcare Title Studio

Animated video title generator. Edit text, tweak motion and background in the sidebar, then export an MP4.

```bash
npm start   # → http://localhost:5173
```

No dependencies — `server.mjs` is a tiny static server (it needs to be served over http, not opened as a file).

- **Preview** renders live on a canvas; scrub the timeline, `Space` to play/pause, `←` `→` to step frames.
- **Export MP4** renders every frame offline with WebCodecs (no dropped frames) — use Chrome, Edge or Safari 17+.
- Settings persist in the browser; *Reset all* restores defaults.

| File | What it does |
| --- | --- |
| `src/renderer.js` | The animation: layout, timeline and per-frame drawing (deterministic for a given time) |
| `src/settings.js` | Defaults and the sidebar schema — add a control here |
| `src/logo.js` | Splits the lockup SVG into glyph squares and wordmark letters |
| `src/export.js` | WebCodecs + mp4-muxer export, MediaRecorder fallback |
| `assets/` | Background image and logo |

# Uploadcare Title Studio

Animated video titles and booth-deck animations for Uploadcare. Four modes in the top bar:

- **Intro / Outro** — the title sequence, drawn on canvas. Edit text, tweak motion and background in the sidebar, export an MP4 straight from the browser (Chrome, Edge or Safari 17+).
- **Mascot** — the pixel character from uploadcare.com's CLI demo, one reaction per clip (wave, dance, yes, no, wow, love, think, sleep, party…), square by default for social posts. Add an entrance or exit or a pixel speech bubble. Exports an MP4 like the titles (with a green-screen option for keying), or with no background to lay over your own video: **MOV** (ProRes 4444 or HEVC with alpha, encoded on your Mac through the local server), **GIF** or **Lottie**.
- **Library** — the cards from the Ecommerce Expo and Webflow booth decks, previewed live and exported in desktop (16:9), mobile (9:16) or square (1:1), flat or with the Camera look. Library exports render on your machine, so run the studio locally for them. See [`library/README.md`](library/README.md).
- **Shots** — the animations on uploadcare.com, one component per card, in the same panel and with the same exports. See [`library/shots/README.md`](library/shots/README.md).

```bash
npm install   # once — only the Library renderer needs it
npm start     # → http://localhost:5173
```

The deployed site is static (`vercel.json`): everything but Library and MOV export works there.

- **Preview** renders live; scrub the timeline, `Space` to play/pause, `←` `→` to step frames.
- **Export MP4** renders every frame offline (no dropped frames).
- Settings persist in the browser; *Reset all* restores defaults.

| File | What it does |
| --- | --- |
| `src/renderer.js` | The title animation: layout, timeline and per-frame drawing (deterministic for a given time) |
| `src/settings.js` | Defaults and the sidebar schema — add a control here |
| `src/logo.js` | Splits the lockup SVG into glyph squares and wordmark letters |
| `src/mascot.js` | Mascot mode: reactions (frame + timing steps), entrances, layout and drawing |
| `src/mascot-export.js` | Transparent mascot downloads: GIF encoder and Lottie JSON writer |
| `render/mov.mjs`, `render/movwriter.swift` | Transparent mascot MOVs via AVFoundation (`node render/mov.mjs --inspect clip.mov` checks one's alpha) |
| `src/mascot-sprite.js` | The mascot's pixel art as ASCII: the site's original sprite frames, new poses, props and the caption font |
| `src/export.js` | WebCodecs + mp4-muxer export, MediaRecorder fallback |
| `src/library.js` | Library mode: deck/card picker, live preview, export through the local API |
| `library/` | The vendored booth decks and their build (`python3 library/build.py`) |
| `library/camera.html`, `library/shots.js` | The Library's Camera look: a card filmed on an angled screen, and each card's shots |
| `library/shots/` | The Shots deck: uploadcare.com's animations, filmed from mirrored pages (see its README) |
| `library/uploadcare-web/` | The homepage's how-it-works demo, rebuilt frame-exact (played by Shots) |
| `render/` | Frame-exact headless-Chrome renderer for Library cards (`npm run render`), its local API and regression check |
| `server.mjs` | Static server; run directly it also serves the render API |
| `assets/` | Backgrounds and logo |

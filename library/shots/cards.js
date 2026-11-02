// Shots cards: what each one films and how (see deck.html for the player).
//
//   kind: 'site'  a component on a mirrored uploadcare.com page (site/<page>.html)
//     target      the component; scrolled to the middle of a 1440×900 page
//     cursor      waypoints: arrive at `to` (selector, or [x, y]) at `t`,
//                 after a `move`-second glide; `click: true` clicks there
//     views       per shape, a list of { t, el | rect | cursor, pad, cover, zoom, dur }:
//                 from `t` the stage eases (over `dur`) to frame that
//     actions     { t, scroll: px, dur } or { t, call(doc, win) }
//     css         extra styles for the page (hide what's in the way)
//     isolate     selectors to keep visible (default: target); false shows the whole page
//     plain       the "animation only" version (?text=0): { hide: [selectors], css, views };
//                 the hidden copy is trimmed out of framed boxes where it runs along an edge
//   kind: 'deck'  a card of another Library deck, played as is
//
// Times are seconds into the card. Views default to framing `target`.
// One module per page in cards/, in the order the pages are listed here.

import home from './cards/home.js';
import fileUploader from './cards/file-uploader.js';
import imageCdn from './cards/image-cdn.js';
import videoCdn from './cards/video-cdn.js';
import pricing from './cards/pricing.js';

export const CARDS = [...home, ...fileUploader, ...imageCdn, ...videoCdn, ...pricing];

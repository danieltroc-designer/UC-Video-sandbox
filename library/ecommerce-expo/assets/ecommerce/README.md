# Ecommerce Expo assets

Drop final event artwork here using these exact filenames, then run
`python build_simple.py`.

## Product imagery

- `product.jpg` — optional shared catalog product image.
- `card1-product.jpg` — the exact tube photograph from Figma frame `234:979`.
  Card 1 uses this one source for the dragged file, compact upload row,
  optimization preview, blurred wash, and frame `234:1415` storefront. It is
  required and inlined for offline playback.
- `card1-browser-{os,left,right,back}.svg` — exact browser controls for Card 1's
  storefront payoff.
- `catalog-admin.png` — reference capture of the product-backend view. **Not
  inlined**: Card 4's backend is rebuilt as DOM so it stays sharp on the TV.
  Keep it as the source of truth for that page's layout, copy and colour.
- `catalog-media-hover.png` — reference capture of the Media card's hover
  state, with “Edit with AI”. Also documentation only, for the same reason.
- `catalog-source.jpg` — the production Ashfold source image, UUID
  `01362b9d-462f-4db4-8c8a-acd0b4c2a06a`. Required and inlined; it is the photo
  in the Media slot, the catalogue preview and the editor canvas.
- `editor-after.jpg` — the real “Brand sage backdrop” result, UUID
  `3d5bbd80-9f76-46d0-b7ff-263dbb1ec4fe`. Required and inlined.

The reference captures establish where AI editing lives in the marketplace
flow; the source and result are the real images loaded by that demo. The exact
preset prompt is stored as `CE_PROMPT` in `src/simple.template.html` and
documented in `EVENT.md`.

The 1536×2048 source and 880×1168 result both use the same 3:4 editor crop. The
tool's dense dot-grid pending state covers the generative swap. Do not replace
the result with a CSS treatment or synthetic mockup: regenerate it through the
real tool and update its UUID and prompt provenance together.

## Benefit icons

Card 2 uses five required 48×48 SVG exports from storyboard frame 212:1213:

- `benefit-mobile.svg`
- `benefit-conversions.svg`
- `benefit-peak.svg`
- `benefit-maintain.svg`
- `benefit-store.svg`

Their accent colours are part of the artwork. The build fails instead of
substituting a different glyph if one is missing.

## Infrastructure flow

Card 6 uses the exact exports from Figma frame 218:1470:

- `infrastructure-product.png` — the 1800×2400 cosmetics photograph.
- `infrastructure-node.svg` — the rail's 8.14062×8.14062 endpoint.
- `infrastructure-line.svg` — its 308.719×1 connector stroke.
- `infrastructure-collapsed.svg` — frame 219:1578's yellow 66.281×8.14062
  compact connector.
- `infrastructure-lockup.svg` — frame 219:1612's final 339×61 Uploadcare
  lockup.

All five are required. The build fails rather than falling back to the flower
thumbnail or redrawing the path, because their crop and native boxes are part
of the card's animation geometry.

## Customer logos

Customer SVGs live in `assets/logos/`, and the build scans that folder
automatically — dropping in `<normalized-name>.svg` is all a new mark needs.

All six wall marks and the Zephyr attribution are now real vectors. They are
exported from storyboard frames 207:1131 and 204:1081 and carry those frames'
bounding boxes, which `ECOM_WALL` in the template is measured against: re-export
from the same frames or the slot sizes stop matching. A name with no vector
still renders as neutral text rather than disappearing.

## CTA

Replace `assets/qr/booth-qr.png` only after the Ecommerce Expo destination is
confirmed. Card 7 currently shows it because frame 219:1638 is an explicit
mockup of the inherited Webflow board/outro, but `qrConfirmed` must stay
`false`: the visible code still points to `https://l.ead.me/bgyXox` and is not
approved for Ecommerce Expo.

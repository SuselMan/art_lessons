# ROI presentation: preserve physical paper/noise origin

External, unapplied patch against `397d03f5`; no served source or shader changes and no GPU run. Files and exact base/candidate SHA256 are in `candidates/roi-paper-origin-manifest.json`.

The presentation crop uses bottom-up texture region `(x,y,w,h)` of a physical tile `(originX,originY,W,H)`. Geometry correctly sets synthetic top-down origin to `(originX+x, originY+H-y-h)`, but that geometry is not the sampling origin. A local ROI GL pixel q corresponds to physical GL pixel `q+(x,y)`. Therefore the original paper/noise basis is:

`q + [originX+x, -originY+y]`

Using synthetic origin instead produces Y basis `-originY-H+y+h`, differing by `-(H-h)`. Do not change geometry to fix a sampling coordinate.

Patch forwards a new optional sixth `PuddleRoomHost.render` argument through the engine's Puddle render adapter, `_drawRibbonCompositeRect`, `RibbonPasses.drawRibbonCompositeRect`, and `drawRibbonCompositeDab`. Only `u_paperOrigin` uses override values. Undefined keeps the exact old default, including normalised negative zero. No full-viewport substitute, shader modification, solver/material/global phase or ambient policy change.

Other compositor coordinate paths were checked:

- DAB_FRAG watercolor branch uses local `tileUV=gl_FragCoord/u_resolution` for cropped material/original inputs: this must remain local.
- World paper lookup uses `(gl_FragCoord+u_paperOrigin)/u_paperTexSize*u_paperScale` (`shaders.ts:1530`).
- Watercolor cloud/fibre/mottle world basis is `wp=gl_FragCoord+u_paperOrigin+u_fieldOffset` (`:1582`): the same override fixes this noise phase; recorded fieldSeed remains unchanged.
- Dab centre is intentionally relative to the synthetic geometry; rectComposite is set and grainMode=0. Ribbon band `u_worldOrigin` is not used by this composite method. Charcoal/graphite source-deposit paths are not changed.
- Local pixel spacing, migrate/smoothing texture neighbourhoods and material sampler coordinates stay unchanged. Their possible crop halo/filter equivalence is separate from this demonstrated basis error.

CPU runner: `node_modules/.bin/vitest run --config docs/qa/runs/747-large-pages-20261017/candidates/roi-vitest.config.mjs` —10PASS. Six helper cases cover all sign quadrants, full region and partial one-pixel edge, independently compare local-pixel world basis, and preserve synthetic geometry. Additional tests verify rect→dab optional-argument identity and actual uniform binding for undefined/default, odd301 override and explicit zero. MockGL/interception does not prove shader pixels. Native FULL-vs-ROI same-input equality remains the promotion gate, with outside-region equality recorded separately.

# Accepted gallery: sheet3 rectangular fringe, CPU localization

06.10.2026, acceptedc1997fee source read-only. No source, production activation, gallery,5301 or GPU changed. This is technical clip diagnosis, not new visual tuning.

## Exact operation inventory

Sheet3 roomUSvHhyi8 slot4 [910,1057,1264,1323]. Latest relevant washcoQzRc5Mef:

- seq39 x-GtWsMU7h, clearwater100:0chisel,94dabs, x1043.710–1096.914,y1154.489–1176.280.
- seq40 p_kZxjdEcl, clearwater100:0chisel,333dabs,x1028.508–1174.952,y1128.782–1268.728.
- seq41 9zCyVB-YfN, pigment100:100chisel,62dabs,x1055.753–1064.495,y1169.283–1189.533,size8.751–24.697,aspect2.834–4.454,recordedwet allf.

All samewash. Older35/36 doLgqDsl6j/It3zajR7n8 are among nativeBatchSkipped in gallery report; they are not the final visible repeated target. Source packed dabs decoded with real shared strokeDabs, saved `temp/geometry/clip/sheet3-inventory.json`.

## Canonical image vs production geometry

Viewed actual canonical sheet3 PNG crop, not only contact sheet. Rectangular edges: top~1120, bottom~1239, rightlastcolored~1154 in world pixels. Left is curved by water reservoir, so this is not simply wholeimagecrop.

CPU oracle calls real RibbonStrokePainter/profile/preset/dabWorldHalfExtents with targetGPU list empty, so it computes geometry without drawing P/V. For actual target9zCyVB-YfN production reach union:

`[979.640055869,1133.089531076,1141.298607456,1225.241784420]`.

Composite read pad12 produces finishbounds `[967.640055869,1121.089531076,1153.298607456,1237.241784420]`. `RibbonPasses.drawRibbonCompositeRect` floorsmin−1/ceilmax+1, giving top1120,bottom1239,rightlimit1155 (last pixel1154). These match straight visible edges. No finishContext was generated in targetless oracle; finishbounds are derived from the exact painter formula, not a captured GPU object.

`PencilEngine._finishRibbonStroke` after settle calls final compositor with original source ctx.bounds. `WatercolorSettlePlan` allocates/stitches/transports/copies back over ctx.bounds plus real front/diffusion/dry margin, records actual noteStorageBounds. Independent V enables pigment motion within a larger existing water reservoir. Therefore material can exist outside the old target quad while the final composite cannot show it. The numerical edge match strongly localizes final composite AABB clipping; it does **not yet** prove nonzero P/depth beyond that quad. That is the next causal GPU check.

## Isolated next proof, no blanket pad

Prepare small identical clearwater dab (large) then pigment dab (small), samewash, same accepted tuple. Capture P/C/V/coverage just before final composite, old ctx bounds, actual storage bounds and material alpha/strength outside old quad. Off/on switch changes ONLY final presentation/composite write quad to actual solver-written/storage region. Solver input/window, spread/falloff/source films remain identical. Compare output border profile and canonical fields, then rebuild parity and GL0. If material outside old quad is zero, reject this hypothesis; investigate solver/front copy window or stale framebuffer instead.

Candidate fix should use exact solver output/storage domain and correct resident targets/damage marking for final/progressive composite, not increase an arbitrary halo/pad constant. Storage is lifetimeunion, may include previous water or disconnected gestures: constrain to real current written domain/targets if needed. Dry/rebuild/checkpoint must use same rule. Foreign solvent reservoir domain and tileboundaries require separate control; do not replace historical halo bounds with arbitrary constantwater mask.

Prepared diagnostic harness `temp/geometry/clip/clip-ab.mjs` (not run, still needs bounded fullcase captures/source stamp and runtime approval). It wraps composite quad only; no shader/P/geometry source change. CPU `geometry.test.ts` passes. Screenshot `temp/geometry/clip/sheet3-4.png` shows actual issue.

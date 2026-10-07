# Production canonical ribbon preparation audit

Source0006c583, read-only production audit. No engine callsite changes.

1. `PencilEngine._paintDabs` chooses ribbon profile and manages stroke owner/context; `_ribbonStrokeWork` invokes `RibbonStrokePainter.paint`.
2. `paint` lines466–514 maps recorded wet digit before filtering/clamping, bridges from last kept dab and applies travel quantum. DabSystem and recorded dabs must remain unchanged.
3. Bounds, first spacing/direction and composite scalars are gesture-state computations. Off-sheet dabs still consume water/pigment clocks before early return.
4. `prepareDelivery` lines170–371 computes deposits and per-dab water/pigment/paperWet/puddle/pigmentPool/excess/across maps. It advances scratch fields (trail, time, travel, surplus, slowdown, landing); this is not a pure function of dabs alone. Snapshot/apply state and exact order are required. `ctx.dabPool()` writes optical deposit ownership; `markerSegmentLength` is geometry.
5. Halo shedding lines810–853 contributes a per-dab multiplicative deduction. Do not invent/omit it even when default draw-off makes it zero.
6. Lines853–929 build exact11-float vertices from the prepared maps. This is a pure CPU seam; helper extraction here is safe without a WebGL context. Film/additive flags affect dose, fillEveryPose and blending. Ink, coverage-water and solvent bands differ in channels despite shared geometry. Pressure remains encoded by buildRibbonBands. Existing markerRibbon/ribbonBandBatch retains canonical geometry and float order.
7. Stamps/caps lines1015 onward remain essential. Bands alone do not provide full production deposition. Coverage, pigment and color stamps use distinct uniforms/defaults. Native backend must accept separate prepared nib stamp commands; an empty stamp list cannot silently mean equivalent output.
8. Production draw calls lines1113/1145 are the authority for uniform forwarding: aaPx/cloud/granulation/mottleSeed/washWater0/waterRetain0/combs/bristleInk/tau/poolBlot/availableWater and tile world origin. Ink film uses MAX, nonfilm uses ADD. Coverage is a different pass; color stores absorption with the same source geometry.

Pure helper scope: exactly step6, accepting already prepared maps and retaining original Dab keys. It does not synthesize pressure/dose, own clocks, filter dabs, select tiles or create CanonicalRibbonBatch resources. Native adapter can pair this output with production uniforms and explicit cap commands. Full logical delivery extraction requires a separate owner-state contract and golden live-vs-chunk replay tests before use.

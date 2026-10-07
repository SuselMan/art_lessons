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

## Stateful CPU extraction

`ribbonDelivery.ts` now owns the unchanged delivery algorithm. `RibbonDeliveryState` is a structural interface holding only CPU clocks, landing/dwell, trail/speed/turn/reservoirs, standing map, brushTravel, lastKept and wetContacts. `RibbonStrokeScratch` remains the production owner and satisfies that interface; no GPU ownership moved. `createRibbonDeliveryState()` supplies an independent native caller state, initialized with the same per-gesture defaults. Full algorithm text is identical after replacing `this.ctx` and diagnostic field access paths only; proof digest in delivery-extraction-proof.json.

`ribbonDrawable.ts` owns unchanged original-index wet mapping, thin nib clamp/filter, lastKept travel-quantum filter, wetContacts bookkeeping and production landing/dwell segment length. Existing painter/engine delegate to these helpers. Canonical recorded Dab objects are not rewritten. Native caller invokes in order:

```ts
const state = createRibbonDeliveryState() // once per gesture, carry between chunks
const prepared = prepareDrawableRibbonDabs(dabs, previous, preset, profile, state, slicedRecordedWet)
if (prepared.drawable.length) {
  noteRibbonWetContacts(state, prepared.drawable, preset, prepared.wetOf)
  const delivery = prepareRibbonDelivery(
    prepared.drawable, prepared.previous, preset, profile, state, prepared.wetOf,
    gestureLandedWet, segmentMode, segmented, film,
    { markerSegmentLength: ribbonSegmentLength, dabPool: () => gestureDabPool }, options,
  )
  // delivery.deposits = per-kept-dab stamp doses; maps feed pure canonical bands.
  // Caps/stamps still use production nib geometry, across, pressure and delivery maps.
}
```

`gestureLandedWet` is fixed at the production finish-context landing value, not sampled anew per batch. Recorded wet substring indexes this call's original dabs; filtering must happen in the helper. Keep options/profile/film identical to production route. For live-style segmented execution clear standing once before the segment loop, as the existing painter does, and pass segmented=true to every subcall. No GPU scheduling, off-sheet early return, finish/context/composite or foreign solvent import moved into these helpers; native Room owner must preserve those ordering boundaries. CPU contact bookkeeping is not the physical foreign solvent field.

Validation: frozen pre-extraction production vertex bytes across round/chisel ×MAX/ADD ×12/400 ×segmented/unsegmented; exact delivery state/maps/clocks/dose across whole tape, irregular batches and one-dab batches with repeated timestamps, turns, wet contacts and pressure taper; original wet index after filtered subpixel dab; existing water-source/deferred-source tests. Bundled delivery dependency graph contains no buffer/raster/engine ownership modules. Browser shader/raster parity remains a separate gate.

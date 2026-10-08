# Canonical progressive preview integration

`CanonicalPlannerPreviewBridge` receives the actual full-resolution reconstructed fields from `CanonicalWatercolorSettlePlan`. It uses the existing production composite implementation, fixed original image and zero settle smoothing. It changes only presentation. It does not mutate wash records, manufacture alpha fade, advance solver clocks or alter the final endpoint.

The bounded owner enables `shouldPreview: () => true`. The original planner retains its 150 ms presentation throttle. Capture the active quantum context in the owner; the synchronous callback is:

```ts
(tile, pigment, color, coverage) => {
 const original = scratch.peek(tile.buffer)?.original
 if (!original) throw new Error('Missing captured preview original')
 adapter.retain(bridge.encodePreview(activeContext, tile,
  {pigment, color, coverage}, original, productionMetadata))
 previewReady = true
}
```

`activeContext` must belong to the current `adapter.runQuantum(ctx => ops.run())`. The temporary fields are released immediately after the callback. Encode and retain before returning; never defer the callback with a promise. The composite target is the visible tile, separate from all supplied source fields.

After each bounded quantum, when previewReady, submit the existing paper presentation and yield to requestAnimationFrame before executing the next quantum. Presenting only after draining the entire generator defeats progressive movement. The planner can postpone reconstructions to its own presentation generator; continue running the same job through completion. End with the normal job.finish and finish owner, preserving the same dry result. A device-completion await per quantum is not required merely for display ordering: queue submission order preserves dependencies.

Unsupported boundaries remain explicit: one configured tile, normalized watercolor inkMode9/migrate0, and an actual color reconstruction. No Room/network integration, wash reveal scheduler or camera adaptation is claimed by this bridge.

Validation: app typecheck and lint. Existing software live-composite zero-difference gate covers the shared formula, but moving-front/carry end-to-end preview has not yet been recorded. That is a separate pending gate; no hardware quality or parity claim.

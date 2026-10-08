# OFF-default lazy water-front climb

`DIAGNOSTIC_LAZY_CLIMB=false` preserves eager baseline. With true, the identical fbm/climb expression executes once, immediately before the first inbounds neighbor with ci<.999. No neighbor qualifies: climb is unused and its noise reads are avoided. Current-cell height remains eager because outputG always stores it; every invocation still stores full RGBA, sourceB and A=1. Same neighbor order, paper transform/noise lattice/filters, edge/min arithmetic and Q8 boundary. This is dead-work elimination, not a dry-domain skip or new fluid model.

Build existing captured bundle. Root exclusively runs trusted Surface. The bundle also exposes `runEndToEnd`:

```
await window.runEndToEnd({suppliedTape:originalTape,stages:'pressure',sameInputFront:true,lazyFrontOracle:true,frontIndex:1})
```

`frontOracle.lazyClimb` takes the ACTUAL captured GL full-size front input and coverage, native baseline metadata, actual baked Fine and production251 noise. Repeated171 fixed-stride pingpong steps compare ALL RGBA bytes after EVERY iteration. This recurrence probes primitive equivalence; it does not pretend to replace the production multiscale schedule. Dimensions explicitly returned: require1536 for full gate. Foreign film must be absent (existing capture guards it). On available timestamp-query,32 measured AB samples after2warmup pairs alternate arm order, reset to identical original input and measure only front compute via GPU timestamps. Readback/map occurs after timestampend and outside shader duration. Unsupported timestamp is explicit; software timestamps are not hardware performance evidence.

Whole original tape: runEndToEnd twice with SAME originalTape and `diagnosticLazyFrontClimb:false` / `true`; compare author/nativeReplaySha256 for both, errors/lost. Flag applies both native author and replay; GL unchanged; defaultfalse. No default enable before root hardware pass.

Local software32×32 gate covers dry domain and wet seed,8 iterations: every RGBA byte exact, errors[]; both pipelines compile. `node docs/qa/harness/728-front-lazy-climb/check.mjs`. Not full1536 or hardware/performance proof.

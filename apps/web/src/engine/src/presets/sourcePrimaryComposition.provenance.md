# Source single-primary composition session

Independent orchestration, no vendor implementation copied. Not imported by engine,
renderer, presets UI, importer or operation schema. No pixel/kernel identity claim.

Upstream source pin: Krita bd6e8d061d2f0388c5b10278786cf0fe62e3135f.
Full source-only call graph and hashes: QA fixes-v52/canonical-primary-composition-handoff.md
and canonical-primary-composition-receipt.json (raw upstream source retained outside Git).

Reuses existing sourceBlendAverageOpacity (KisPainter::blendAverageOpacity qreal history,
float .1 exponent) and normalizeSourcePainterOpacity (native ParameterInfo float inputs,
qFuzzyCompare aliasing, no hard-flow folding). No duplicate average/alias arithmetic.

Native anchors:

- KisDabRenderingQueue.cpp:73,321–327: average starts0 and advances for each ordered
  actual ready dab. Zero-opacity or zero-coverage pixels do not remove the dab's
  opacity history entry. No asset reads or coverage-based pruning here.
- kis_painter_blt_multi_fixed.cpp:60–62,124–126: each dab's opacity/average/flow are
  separate ParameterInfo controls. Generic/optimized kernel choice is downstream.
- KisFlowOpacityOption.cpp:41–47: query already resolves strength according to actual
  indirect status. Session does not multiply query opacity by UI opacity again.
- KoAlphaDarkenParamsWrapper.h:17–82: hard and creamy are distinct wrappers. This
  session returns unfurled normalized fields; hard folds flow only in its later kernel.
- KoOptimizedCompositeOpOver32.h:31–48,120–133: Over consumes opacity, not flow;
  directOver output intentionally omits flow and outerResourceOpacity.
- kis_painter_based_stroke_strategy.cpp:188–205,274–289: wash paints onto a fresh
  composition-source target, local alpha-darken, while outer blend/opacity are
  retained separately.
- kis_indirect_painting_support.cpp:125–130,196–208,230–232: preview/final merge use
  outer painter against underlying layer. presentWash and commitWash commands name
  the fixed preStrokeSnapshot: rendering the accumulated stroke atop an earlier
  preview would compound it incorrectly. Snapshot allocation/lifetime and final
  committed-layer ownership are renderer responsibilities, not this pure session.

API and guards:

createSourcePrimaryComposition(context) emits beginWash only for wash. The context
is copied and frozen. advanceSourcePrimaryComposition(state,{ordinal,frame}) accepts
shared-decoded single-primary frames only, strictly ordinal0 onward. Shared caller
retains responsibility for full frame schema/geometry/CAS/aggregate cost admission.
Session independently rejects masked execution, incompatible entry/group/fences,
unsupported context, malformed counters/history, duplicate/gapped frames and post-end
input before returning any commands. Pure local calculations have no external effects
on rejection. Returned state/output objects are copied/frozen and JSON-resumable.

Source fences are INPUT framing, never compositing resets. Phase mask is accepted
only as empty post-primary framing. Groups start at0 and advance exactly+1 per native input, including empty inputs, across frames, empty
final tails preserve history, and gestureEnd commits wash once without a fabricated
endpoint dab. With draws and no gestureEnd, advance returns presentWash; gestureEnd
returns commitWash, including a zero-draw tail. Per-frame definition indices remain
scoped to that exact decoded frame; drawOrdinal is gesture-global.

Only outer over is currently admitted. The local creamy/hard policy is explicit,
not inferred from a stock ID, platform name or installed config. No RNG, source image
read, color conversion, alpha/coverage multiplication, GPU resource or kernel dispatch
occurs here. Ink alpha and source A8 handling belong to the separately validated renderer.

Tests use actual shared pack/decode for accepted inputs, then verify split/resume
history and controls, late rejection atomicity, zero-valued records, no fence reset,
empty after-primary/final tails, exact aliasing, direct flow omission and immutable
policy. They prove orchestration only, not native raster pixels or active renderer.

## Four-mode V2 wash policy

Wash present/commit commands retain the immutable selected outer blend rather than
hardcoding Over. All actual draw averaging, local AlphaDarken controls, fences,
resume state and draw ordinals are unchanged. The closed shared composition law
rejects non-Over buildup before issuing commands. This pure composition helper
validates a law, not room/profile authority: encoder/executor additionally check
their explicit trusted raster profile. Tests compare identical local traces and
selected preview/final blend for all four modes; historical Over regressions remain.


## Explicit primary-texture V3 source consumer (not online activation)

advanceSourcePrimaryComposition accepts explicit CanonicalMaterialFrameV3 beside
unchanged AnyCanonicalMaterialFrame (the shared Any union itself is not widened).
Runtime accepts only the named V3 profile, masked=false/primary draws and finite
grainDepth in[0,1], preserving existing fences, phase2, frameDrawIndex and controls.
This is SAME material-agnostic scalar composition state; its version1 remains
appropriate and grants no material replay authority. Actual source adapter owns
the distinct V3 serialized checkpoint and encoder/context owner pins version.
Executor may consume the same signature; no duplicate state machine/projection.

Consumer gates:137 tests/7 suites PASS against shared SOURCE, maxWorkers1;
actual app-options targeted12-root TypeScript noEmit exit0, scoped oxlint0 and
diff-check PASS. Baseline RAM-only Git pin of the five old producer modules
failed six new consumer tests (59 prior tests PASS); no production file was
replaced for this diagnostic. One extended RNG-control assertion initially had
a different fixture initial angle0 vs.3; equal inputs corrected, production
math unchanged. Shared capture/cost APIs are tested in the same joined run.
No online activation, runtime/device/shared-dist/dependency/commit change; no
own background process or temporary service remains.

# Independent bounded runner review

Reviewed frozen root5656188c / runnerdf391de9. This is a bounded serial scene,
not a production Room backend. No hardware was used for this review.

## Confirmed fixes

- `boundedSceneRunner.prepare`: profile must be anchored to
  `scratch.finishContext?.landedWet ?? wetAt(chunk.wet,0)`, matching production
  `engine/index.ts` profile selection before `_ribbonStrokeWork`. Recomputing the
  profile from each later chunk changes watercolor transport/effects when a low-water
  gesture enters a puddle. The retained finish landing and cached gesture scalars
  otherwise still describe the first chunk. A real CPU gesture regression forces
  dry first contact and wet later batches; all live/source profiles remain the
  first landing profile while wetPeak still records the puddle.
- `destroy`: call planner.destroyTextures before retiring the scratch/pool. The
  planner owns cached flow/foreign upload slots separately from pooled tile and
  settle fields. Pool.destroy alone does not retire those backend-owned textures.
  Backend.destroy eventually masks the leak, but runner.destroy on a surviving
  backend must complete its own ownership contract.

## Reviewed contracts that remain unchanged

- Source protocol is per prepared segment: coverage, solvent, solvent landing,
  pigment/color/halo, material landing; one encoder scope retains ordered copies,
  staging and uniforms. Source and live composite are two sequential submissions.
- Material film activates on begin and after a partial chunk settle. Chunk settle
  lands before newFilm; replay keeps lastKept/depletion only for the same strokeId.
- Same retained wash holds coverage/P/C/solvent across water then pigment gestures.
  Distinct wash/layer and foreign-donor selection are explicitly unsupported.
- Reveal scissor is world top-down → legacy GL bottom-up; fieldBuffer converts
  source and destination Y independently to native top-down. Planner geometry uses
  real1536 minimum/256 rounding, not the compact component oracle.
- Cached composite scalars and first spacing persist with the wash scratch,
  matching the current production owner; do not reset them speculatively.
- Per-segment live opacity comes from the actual prepared drawable dab. The final
  finish context retains the gesture's opening opacity, matching production's
  noteFinish behavior. Live per-segment vs legacy per-batch presentation still
  needs an actual end-to-end pixel gate; CPU tests do not prove it.
- job.finish lands canonical fields before final composite within the SAME scope.
  dispose follows composite. Busy/drain blocks overlapping input explicitly.
  Submitted scopes retain retired resources until queue completion. Clear drains
  before retiring source resources and resets replay identity/paper wetness.

## Safe grouping candidate, not enabled by this review

The current serial `settle` encodes/submits each original op synchronously with no
frame yield and no readback between them. For this BOUNDED OFFLINE path, one
`adapter.runQuantum(ctx => { for (const op of job.ops) op(); job.finish();
retain(finish.encode(ctx.encoder,...)); job.dispose(); })` preserves every shader,
copy, upload and Q8 intermediate texture write in its current order. It reduces
N+2 submissions/completion callbacks to1; it does not reduce pixels or GPU passes.

`prepare` must stay in its preceding scope: it may allocate/clear fields and make
CPU owner decisions. The subsequent grouped stream must retain unique immutable
uniform/staging payloads. Pool release/reuse during dispose is safe only because
owner retirement is deferred until that group's GPU completion. Exceptions must
discard the unsent encoder and destroy retained uniforms/staging exactly as
runQuantum already does. No async callback or nested runQuantum is allowed.

First gate: compare ordered pass/copy/upload trace, all intermediate-role bytes and
final composite, baseline vs grouped on identical captures; then actual native
source+packed replay whole layer. Device submit counts and elapsed/GPU timers must
be reported separately. Do not apply this to live frame/morph scheduling or
concurrent ownership by inference. No speedup is claimed without measurement.

# Narrow final Native readback: conditional support proof

Read-only audit, e562d496. No runtime edits or GPU probe.

The proposed crop does not alter Native geometry, operations, global Contrast or coarse preparation: only reads/writes into solved pages after Native finishes. `PagedPuddleTarget.ts:171–180` currently reads one committed bounding rectangle from each P/C/coverage output then writes each core. Omitted solved P/C pages start zero (line118).

## What is established

- Captured support (`PagedPuddleSource.ts:73–104`) unions ALL channels of raw non-original planes, including coverage, P/C and both water planes. Per-tile rectangles are conservative overestimates, not just a pigment-alpha mask. Original paper RGB is deliberately excluded.
- Native published coverage is the captured contour, not temporary front-expanded field coverage: `PuddleTarget.ts:94–98,121` copies source coverage to contour and contour to published coverage. `AccumulationBuffer.ts:586–591` uses framebuffer `copyTexImage2D`, not a low-precision sampling shader. Thus coverage is zero outside raw support; alternatively exact CPU raw.coverage copying is justified for this path. No R32 expansion is required for coverage itself. This applies after completed publish, not transient auxiliary field.coverage.
- P/C are material outputs, not pressure/mask/band. `M70MaterialSupportProof.test-support.ts:17–29` follows material donors separately and regards mode11 as auxiliary. The existing actual-plan graph test demonstrates conservative reach612 (material-only450), not reach32.
- The tighter radius32 relies on the separate dry-exterior numerical contract (`M70MaterialSupportProof.test.ts:78–125`, test-support:31–44): approved schedule/scale/costs, no foreign stencil, unreached-cost fixed point, bounded GPU error and sampling support. `tightMaterialSupport32` plus `noForeignStencil` alone is NOT an independent universal mathematical proof for arbitrary GPU/shader/parameters. CPU simulation and existing admitted device fixtures qualify the contract, not all drivers. Cropped reads must inherit exactly the existing R32 admission assumptions; never infer reach32 from a bbox alone.

## Safe construction under that same admitted R32 contract

1. Validate captured page dimensions and every integer bottom-up support rectangle/compatibility union exactly as M70FixedWindowSkip.ts:8–33. Unknown, invalid, overflow, foreign or changed revision/metadata => original full committed readback. Preserve current metadata rechecks. No adaptive origins or changed solver boundaries.
2. For P/C, independently expand EACH captured rectangle by32, clamp to finite page, intersect with each committed core in common bottom-up coordinates. Outside this union P/C are certified zero, so leave zero pages untouched. Overlaps must be merged/disjoint or copied deterministically. Using a single enclosing rectangle is safe but less efficient. Reads use local Native offsets derived from unchanged physical window rect.
3. For coverage, intersect with unexpanded raw support (or reuse P/C expanded clips conservatively), or write exact raw.coverage per core from immutable CPU snapshot. No need to read auxiliary pressure/mask. Preserve all nonzero raw coverage channels, including arbitrary low bytes.
4. Finish every applicable core/plane before solved inspector/coarse prepare; cancellation cannot publish partial revisions. Solved snapshot and global coarse algorithms stay unchanged. Unknown or unsupported execution keeps current full readRect.

Therefore readback-only cropping is safe CONDITIONALLY on the existing certified R32 material-zero invariant; metadata alone is insufficient to promote that invariant. A universally source-only alternative is the separately proven wider donor radius (with its sampling assumptions), not an unqualified32.

## Required regression gates

CPU geometry properties: odd dimensions/negative padded window origins; flip involution; edge clamps; sparse separated supports and overlap; all-zero support; invalid/unknown/foreign fallback; every nonzero reference pixel lies in kept union. Coverage arbitrary RGBA bytes remain exact. Include multiple committed cores and support crossing1024 seams.

GPU: same immutable source, baseline full reads versus cropped reads on each admitted GPU, ALL solved P/C/coverage stages and global/final outputs byte-exact; actual bytes/read area reduced; zero omitted pages independently checked; edge/corner/long sparse sources; cancel/reset/revision change. Compare same-GPU, not cross-GPU golden. Readback savings are not latency or total-RAM savings without measurement.

## Stronger shortcut: solvedCoverage = raw.coverage (no R32 condition)

For this Paged callchain, replacing the assembled solvedCoverage with the already immutable raw.coverage snapshot is source-backed independently of noForeign/radius32:

- capture only includes eligible entries with both inkLoad/inkColor (PagedPuddleSource:60–65); all other coverage stays implicit zero. The publication loop likewise skips ineligible entries. No missing-plane pixels can appear from omitted tiles.
- restorePagedPuddleWindow/restoreOwnedEntry restores raw coverage with exact CPU upload into a zero-padded physical window. Native reset copies it into contour before prepare; every publish copies contour via framebuffer copy, ignoring mutable auxiliary coverage.
- prepare returning null still leaves the initial publish (PuddleTarget:161,172); zero-material/nojob therefore has the same contour. Throws/cancelled jobs do not reach Paged successful publication, so this shortcut must not introduce a new early publication path.
- Paged uses finalOnly=true, consumePreparedSource=true and deferFinalMix=true. Its background.ops is empty and no Native dry() call occurs. The only Native method changing published coverage separately is dry(), which is excluded from this inner window lifecycle. Later recorded Dry of the outer controller is a separate operation.
- skipped windows currently CPU-copy raw coverage per core; cores partition the finite page, and retained windows publish exactly that same raw contour. A raw snapshot therefore equals the complete assembled solvedCoverage, including negative padded field origins/partial finite edges.
- global postphase reads this coverage for reconstruct; it does not modify the snapshot. Global background does not grant permission to replace temporary field.coverage, only this published raw-contour plane.

Implementation may keep the immutable snapshot directly for solved inspector, coarse/postphase and publication; remove coverage GPU read and per-core writes without support tests or foreign exclusions. Preserve capture lifetime and current revision/cancel/final-publication guards. This is separate from conditional P/C read cropping. Tests should cover arbitrary RGBA contour bytes, nojob/empty, missing material entries, foreign water, padded edges/seams, successful Dry outside the inner solve and cancellation (no partial publish), then Native/Paged ten-stage/final GPU controls.

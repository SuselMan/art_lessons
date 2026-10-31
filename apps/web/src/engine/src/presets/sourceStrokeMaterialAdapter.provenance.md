# Source author → canonical material adapter (inactive)

`SourceStrokeMaterialAdapter` is original orchestration glue over existing source-backed owners. It does not implement new native sensor, random, curve, cache, geometry, sampler or compositor laws. `SourceStrokeAuthor` owns every query/RNG/scheduler decision; `canonicalMaterialGeometryCost` is the shared metadata-only preflight; `buildCanonicalMaterial` owns dictionary order/F64 bytes and returns decoded values. No active engine, wire, server or descriptor hook imports this adapter.

Usage is deliberately explicit:

1. Construct with the same immutable `SourceStrokeAuthorProgram`, room-pinned CAS rectangle context/budgets and exact author state. The adapter forces the real shared geometry cost; a caller cannot install a weaker callback.
2. Collect every chunk returned by `beginInput(state)`, then call the author `plan` once. Feed each yielded result to `accept` exactly once and collect every returned chunk. Private refresh/query yields have no draw or local-input record. A returned chunk can be the OLD pending chunk while the newly accepted result remains pending; no author/RNG retry occurs.
3. `flush()` makes an optional explicit cut at any yield, retaining the correct entry phase. Each new chunk repeats all definitions it references, including original saved geometry on a source cache hit. `finish(state)` is the outer queued pen-up fence, not an inputComplete; collect every returned chunk. Never drop a chunk because its draw count is zero: structural/final fences may be its entire content.
4. `SourceCanonicalFrameEncoder` now wraps each flushed packed chunk in the pinned shared stroke envelope, validates it through the shared decoder, and preserves gesture frame order for live cuts. It has no active engine/network hooks. Its returned decoded frame is the future local/wire input; author-local inputs remain local.

Future local paint consumes `chunk.frame`, already decoded from `chunk.packed`, not raw author DTOs. `chunk.inputs` is deep-frozen AUTHOR-LOCAL metadata aligned exactly with frame.draws: actual typed pointer packet, F64 sourceAngle/sourceTime, logical sequence and role. It is not a new wire field or query journal. Runtime author Request has extra scheduling fields; the packet projector preserves all typed packet fields and retains the one authoritative direction separately in sourceAngle.

Pair the author's immutable state and `adapter.checkpoint()` AT THE SAME accepted yield for a pause/fork. Restore the author via its existing resume method and construct the adapter with that paired checkpoint. Program/role binding, author counters, phase, pending closed frame and bounded input alignment are checked before cloning. Returned chunks and checkpoints are deeply frozen and independent of caller-owned objects. No native RNG state is stored in this adapter checkpoint.

Fences describe source input framing only. Whole primary pass precedes mask; primaryEnd survives a mask pass with no painted yield. A boundary at a transport chunk does not composite/reset a mask. Structural masked frames are possible; execution still requires the separate shared capability gate, which rejects mask execution until compositor semantics are accepted. An empty after-primary tail is valid for a primary-only source.

The incremental buffer checks trusted metadata work/output/draw-pixel budgets before appending a result, and uses bounded primitive metadata interning to avoid re-running geometry for every prior definition on each yield. Final flush revalidates through the one shared codec/builder. A single definition outside the cold-chunk domain throws before flushing or mutating old accepted state; it is never dropped, resized, rerolled or replaced with an approximate renderer. In particular the common fast-matrix limits remain explicit. This unit does not establish that every possible random tiny size of every stock preset is admissible.

Tests drive the REAL SourceStrokeAuthor, not fabricated material/phase yields: fixed primary and independent mask programs,50ms private refresh, saved MISS versus later slightly different cache-HIT request, zero-opacity paints, zero-paint mask role, fan0t requests, F64/signed-zero direction, budget cuts, cuts after every yield, and resume at every yield. Baseline and cut/resumed traces compare draw recipes, exact inputs and all fences. A throw-on-RNG spy checks adapter-only consumption makes no random calls. These are integration/glue tests; not a new native pixel receipt or a claim about installed Krita dispatch.

Validation for this unit:4 focused files58 tests pass, real `tsc --noEmit -p apps/web/tsconfig.app.json` passes, targeted oxlint has no warnings. Earlier use of the reference-only tsconfig.json was insufficient and was replaced by the real app target. No device/process/service/runtime resources were created.

## Typed wire2 and room-target packetization

The same adapter and encoder now accept a typed wire2 context. Real default-auto
roles require the verified descriptor binding, exact descriptor ID/version,
coverage profile, canonical static source parameters and stored scale 1. This
uses `canonicalDefaultAutoSourcePin` / `canonicalDefaultAutoCost`; it does not
invent CAS assets or treat source presence as an execution grant. Static numeric
zero normalization is the shared wire2 policy; dynamic shape/subpixel F64 values
retain their bits. This is not Krita UI Size lowering: native UI size rewrites
and serializes the generator, rather than granting a different stored scale.

Optional authoritative `targetGeometry` is copied at construction and never
comes from the viewport. Both image and auto use `planCanonicalTargets`, clipping
to the page before enumeration. A chunk's union is bounded to at most 64 tile
coordinates (or the smaller configured cap). Overflow cuts the previous chunk
only after the new logical result passes cold material and target validation;
one oversized dab fails without flushing or advancing counters. Invisible/off-page
logical requests and all structural fences remain in the frame. The encoder
rechecks the same grid before committing an ordinal; it is not another packetizer.

Legacy image/no-target checkpoints retain version 1. Wire2 or a target-pinned
adapter emits private checkpoint version 2, pins material version and room grid,
and recomputes pending target keys from validated recipes on restore. Serialized
keys cannot confer admission. No native query/RNG journal or additional renderer
queue was introduced. Generic result typing follows the immutable constructor
context version; the real shared builder still checks every recipe and produces
the decoded frame consumed locally and remotely.

Host integration tests cover seven real default-auto descriptors with 30 pressure
inputs each, restore at every author yield with both pending and flushed packets,
shared-envelope decode equality, sparse target cuts, page-clipped empty writes,
forged checkpoints, immutable room grid, cold oversized-request rejection and
encoder ordinal preservation. Existing legacy image traces/fences/byte semantics
remain covered. This is author/wire glue proof, not native pixel identity, UI
activation, server authorization, a new resource quota or straight-room opening.
No device, server, dependency copy or runtime was created for this unit.

Soft auto off-path bridge: descriptor readiness selects an explicit coverage
profile and the existing soft geometry/material policy. Wire2 context pins the
separate mapped radial dictionary via canonicalSoftAutoSourcePin, including deep
immutable coefficient copies. Adapter recipes read resolvedSource (the saved
cache generation), bind primary/mask sourceSlot 0/1 and use canonicalSoftAutoCost
before the common codec and encoder. No image fallback, new packetizer or render
formula is added. sourceStrokeMaterialAdapter.soft.test.ts uses explicitly
synthetic mapped coefficients; native fixtures and their unsupported reasons
remain intact. This does not prove native whole-stroke rendering equivalence.

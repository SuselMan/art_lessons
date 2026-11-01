# Author material to shared stroke envelope

`SourceCanonicalFrameEncoder` is orchestration glue. It adds no brush math,
geometry, sampler, RNG or native dispatch law. It connects existing
`SourceStrokeMaterialAdapter.flush().packed` output to
`decodeCanonicalStrokeFrame`, and uses the existing pure
`advanceSourcePrimaryComposition` cursor to reject repeated, reordered, masked
or post-end frames before advancing its ordinal.

Construct once per gesture with the room/descriptor-pinned brush identity,
stroke identity, RGB bytes, composition policy and material CAS/budget context.
These are copied independently of mutable tool state. The geometry cost callback
is always the shared `canonicalMaterialGeometryCost`; there is no weaker
caller-supplied preflight. The empty constructor probe validates context through
the real shared codec/decoder; it is not emitted and does not consume ordinal0.

At any accepted author yield, pass every chunk returned by the adapter, including
explicit live flushes and empty structural/final chunks, to `encode(packed)` in
order. A source query does not create a material draw. Cuts do not reset wash
opacity history or imply pen-up. The encoder has no pending queue and does no
work proportional to the entire stroke. Each chunk is already bounded by the
shared material codec. Rejection leaves its ordinal/gesture cursor unchanged.
After successful encoding, retain the returned immutable envelope for transport
retry and pass its decoded `frame` to local rendering. Do not call `encode` again
for a transport retry: that would allocate a new ordinal or be rejected as an
out-of-order structural frame. Author-local `chunk.inputs` stays with the author;
it is not another wire input or material authority.

The envelope's installed fused scalar profile must match the explicitly prepared
`CanonicalFrameExecutorOptions.rasterProfile`. The reference scalar profile used
by earlier diagnostic corpora cannot execute these envelopes as that profile.
This does not attest native SIMD packet partition or allocator alignment.

Tests drive the real author/adapter through whole chunks and cuts after every
yield, compare exact material/input/fence traces and decode JSON envelopes at the
shared boundary. They cover a pre-pen-up primary continuation, empty final tail,
immutable UI/CAS context, truncated material, repeated/reordered frames, masked
capability and cold-budget rejection without ordinal advance. An RNG throw spy
proves envelope creation never re-evaluates author randomness.

This bridge has no active pointer, engine, Operation, Socket or server hook.
Trusted server capability, operation ordering/repair and straight room/writer
activation remain separate work. These tests are not a native pixel or device
performance receipt.

## Explicit V2 outer composition

The existing encoder now copies the trusted rasterProfile into its pinned context.
Omission preserves the exact legacy version1/Over output. Only the explicit new
whole-pipeline profile emits version2; its four non-Over modes require wash. The
same constructor probe/shared decoder and ordinal cursor are retained. New tests
mutate caller profile/composition after construction and reject truncated/repeated
chunks without ordinal advance, including empty terminal chunks for each mode.
Material bytes, author evaluation, FIFO/transport and room activation are unchanged.


## Explicit primary-texture V3 source consumer (not online activation)

Explicit SourceCanonicalStrokeContextV3 requires top-level materialVersion3 and
GenericSC raster profile, including its empty constructor probe. Both probe and
encode use the actual shared explicit-aware decoder; decoded frame3 then enters
the SAME primary composition state machine and target-grid checker. No V3 cast to
V2, bare inferred awareness, Snapshot/result/oldAny union widening or renderer
activation. Failed encode cannot advance ordinal; terminal phase2 tails persist.

Consumer gates:137 tests/7 suites PASS against shared SOURCE, maxWorkers1;
actual app-options targeted12-root TypeScript noEmit exit0, scoped oxlint0 and
diff-check PASS. Baseline RAM-only Git pin of the five old producer modules
failed six new consumer tests (59 prior tests PASS); no production file was
replaced for this diagnostic. One extended RNG-control assertion initially had
a different fixture initial angle0 vs.3; equal inputs corrected, production
math unchanged. Shared capture/cost APIs are tested in the same joined run.
No online activation, runtime/device/shared-dist/dependency/commit change; no
own background process or temporary service remains.

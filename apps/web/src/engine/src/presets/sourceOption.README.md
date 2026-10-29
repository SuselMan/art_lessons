# Isolated source option/query executor

This module is deliberately unconnected to importer, author input, codec and renderer. It is a CPU foundation, not additional admitted brush compatibility. The pinned reference is Krita bd6e8d061d2f0388c5b10278786cf0fe62e3135f.

`sourceOption` folds active sensors in native construction order, with native size/rotation components and all five scaling combine modes. Fuzzy-per-dab uses the supplied mutable Taus88 source. Fuzzy-per-stroke uses the supplied keyed source and exact option-name suffix. Neither creates a coordinate hash. Nonrandom sensor `value(info)` inputs and native256-entry transfer tables are explicit inputs: this layer does not fabricate pressure/angle/time/fade laws or spline tables. Transfer interpolation retains native epsilon branches and native `copysign` semantics (negative zero is nonnegative).

`SourceStampQueryExecutor` shares that context across spacing refresh, timing refresh and paint. It models native Size early-return, Rotation/Ratio/Scatter, indirect Opacity/Flow, Mirror→Spacing, and wrapper Rate. No-paint branches still execute wrapper Rate. Source mask extent and native canPaint/size predicates are mandatory caller boundaries; diameter is never guessed from continuous GL radius. Construction/material is an explicit callback boundary; its worker/cache/source ordering is NOT established by these tests. Softness/Lightness, texture, mirrored material passes, masking-child scheduling and116 animated/mixer behavior still need source-resolved contracts before any integration. The host C++ fixture observes Lightness-before-Softness constructor evaluation; this is not a portable C++ evaluation-order promise.

Mirror is a refresh consumer, including both axes enabled simultaneously: their parity can cancel but the consumed draw does not. The stock110 timing guard correction is separate from this unused helper.

## Evidence

`fixtures/sourceOption.native.json` contains192 cases compiled from verbatim pinned `KisCurveOption::computeValueComponents`, `ValueComponents::sizeLikeValue` and `rotationLikeValue` bodies. Deterministic sensor parameters and Qt scalar/container types are minimal stubs. Twelve transfer cases compile verbatim pinned `KisCubicCurve::interpolateLinear`, including epsilon, negative-zero and out-of-range branches. SHA hashes and limitations are in the fixture.

`fixtures/sourceStampQuery.native.json` compiles the actual `KisBrushOp::paintAt` method with option/geometry/material test doubles, covering both early-return branches. EffectiveSpacing Mirror→Spacing and wrapper Rate in this fixture are source-informed stubs, not independently compiled method evidence. Eight separate Mirror cases compile the actual `KisMirrorOption::apply` body and prove axis/checked short-circuit. Tests keep these distinctions explicit. This is CPU/source evidence, not a GUI stroke or a brush pixel identity claim.

The existing nativeRandom fixture independently verifies the Taus/keyed generators. New tests exercise shared parent/child context, checkpoint restoration, no query-local resampling, zero-amplitude Scatter consumption, and material-before-spacing consumption.

## Storage decision remains open

Pixel replay does not require serializing each non-painting query if every emitted paint/material channel is already resolved once by the author. Replaying such channels must never rerun this executor. A debug transcript is useful for native comparisons and stays internal here.

Continuing author generation requires an opaque checkpoint containing the sequential source state/cursor, keyed seed/cache and the scheduler's pending distance/time/refresh/input state. Material/cache/worker and parent/child ownership state must be included when those consumers are implemented. A three-word RNG state alone is insufficient. Persisting this checkpoint at an endpoint could support future continuation without sending every query; whether author continuation is needed after reload/fork must be decided at the product/operation boundary. Current preview/fork continuation remains in-memory and does not need a new network event format.

No wire format, new schema version, runtime stock admission, or full-query transcript is introduced here.

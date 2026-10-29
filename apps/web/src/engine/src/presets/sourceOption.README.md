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

## Deterministic sensor, spline and Scatter units

`sourceSensors` adds the scalar native pressure/maxPressure/tangential/speed/rotation/tilt/perspective/drawing-angle/time/fade/distance laws. It receives native packet values, not browser-normalized replacements; speed and locked direction are not recomputed from positions. Unknown laws and invalid length/sequence inputs fail closed. The32×14 compiled native method fixture includes hover, fractional time, repeated fade periods, tilt offsets and locked angle. Qreal trigonometric behavior is tested against the host C++ libm for these packets, not universally proved against Android/iOS libm.

`sourceScatter` is independently checked against128 actual compiled Scatter.apply cases with asymmetric extents, all axes/checked states, zero strength and several rotations. Qt5 QVector2D float construction/scalar multiplication is modeled explicitly. The common query executor now calls this same helper.

`sourceCurve` samples native global polynomial coefficients in pinned order and handles identity bypass. It is NOT a replacement spline solver. Twelve actual stock curve strings were compiled through the pinned2024 KisCubicSpline template and upstream Eigen3.4.0 SparseLU; every one of their3072 samples matches exactly. Fixture records source/archiveSHA and coefficient programs. This proves that coefficient→table stage, not runtime's Eigen build/version equivalence. The old second-derivative solver differs in1794 samples among11 nonidentity inputs; no tolerance converts those into an exact pass. Supporting arbitrary imported curve points needs a faithful native solver boundary (for example bounded offline/WASM compilation), not a fixture-only allowlist.

## Compiled option programs from stock inputs

`compileSourceOptionProgram` takes native option DATA after settings-reader selection/checkability, compiles its selected common/per-sensor curve once, then binds raw native sensor packet values on every query. It does not parse XML or infer implicit settings. Curve coefficients are an explicit arbitrary native-solver input, not a stock lookup baked into application logic. Unknown/duplicate sensors, invalid length laws, unresolved active-sensor fallback and missing nonidentity solver output fail closed before an RNG exists. Native active sensor order and option name remain authoritative; packet-dependent sensor values are not cached across refreshes.

The full stock-data fixture covers original eight stamp refresh consumers84/103/105/108/111/112/113/114 plus newly discovered110. Opacity and Flow are non-checkable native options and therefore checked even when stale PressureOpacity/PressureFlow fields suggest otherwise. Including these and inactive saved options expands the pinned polynomial fixture from12 to32 curve strings (8192 samples), with a fade sensor among the effective controls. “ascension” means additive tiltDirection; “declination” means scaling tiltElevation.116 and independent masking-child scheduling remain outside this program fixture.

567 composed C++ cases combine actual native sensor.value methods, DynamicSensor.parameter and component methods against these actual option inputs. The random inputs are the independently recorded Boost/Qt seed0 vectors/keyed RotationFuzzyStroke value; they are not regenerated by the TypeScript implementation. Packet/container types and settings-reader lowering are explicit source-informed stubs; native Qt XML parser equivalence, arbitrary curve solver equivalence and GPU pixel equivalence are not claimed. Fixture input SHA links pin the program data, polynomial tables, packet fixture and RNG fixture together.

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

## PNG material/cache planning (isolated, not admitted)

`sourceDabCache` models native material Mirror BEFORE hit testing, native precision levels/current-size comparison, last-generated-key retention, Copy/Postprocess/Dab selection and cached-bitmap rectangle correction. `sourcePngGeometry` models the PNG allocation geometry and hotspot with the source matrix evaluation order, asymmetric original dimensions, static brush scale/angle, native ratio, mirrored subpixel correction and Qt5 rounding. Qt5 negative half ties round toward positive infinity; this is not C `round`.

The optional `SourceStampBoundary.sourceCache` path now uses these real branches rather than external size/mask/material callbacks: a successful paint consumes material Mirror, then independently spacing Mirror on the same source. A cache hit does not skip either query. Existing callback boundaries remain explicitly incomplete paths; providing both is rejected. The bridge remains unimported into the live engine.

`resolvedSource` is an immutable self-contained original material specification: brush identity and original dimensions/static transform, exact continuous generated shape (including scale), key/subpixel/softness/lightness/color identity, generated extent, original mirror bits/position and sequence. On a hit it remains the OLD material even if the current scale differs but quantizes to identical dimensions. Current placement is `resolvedRect`; original source position is provenance, not the new stamp location. This avoids requiring a previous-request lookup across chunk/snapshot boundaries. It is internal data only: no JSONB/F64 persistence, binary encoding, dictionary or new wire API is implied.

640 cases compile actual native calculateDabRect, Brush hotspot/mask, pyramid/roundRect bodies with explicit Qt5.15.2 scalar transform/container shims. These are source-method fixtures, not linked QtGUI or raster oracles.56 transitions additionally compile actual fetchDabGenerationInfo, SavedDabParameters.compare, precision selection, needSeparateOriginal and cached-rectangle correction. Native Mirror.apply is called before hit testing and again for the spacing stage in the harness; its mocked sizeLike consumes a counted fuzzy query with zero final strength. Source input SHA/limitations are stored with the fixtures. Composition tests prove both draws use one real Taus context on cache hits, and self-contained original material survives different continuous scales with equal quantized dimensions.

Actual stock9 audit: all nine are PNG, brushIndex0, supportsCaching true, plain ColorSource. No GIH or per-worker frame selection. Mix/Darken/Sharpness are disabled; stored fuzzy HSV h/s are disabled, active v113/114 uses deterministic pressure. Softness84 is checked but useCurve false/value1; other Softness and all LightnessStrength are unchecked, hence both constructor arguments are1 with no random order dependency. Textures103/105/113 have random offsets disabled and deterministic strength. For these audited flags worker generation adds no RNG beyond material Mirror; shader/color/texture/pyramid filtering identity remains a separate pixel task. Different custom flags must not inherit this stock conclusion.

Mask108 is separately source-audited: the native input segment paints the entire primary line first and the entire mask line second, with shared mutable/keyed random sources but separate dragDistance/cache state. It is not a per-parent-dab child interleave. The present helper does not integrate that scheduler or admit masking compatibility.116 remains outside this PNG planner.

`sourcePngPyramid` models only PNG level metadata and level selection. All levels
are resized from the original prepared image; rounded odd dimensions are retained,
with a transparent one-pixel border. The selected image's actual dimensions determine
each adjusted axis scale. Raster rotation is supplied explicitly and is distinct
from positive logical mask/cache geometry. No QPainter filtering, alpha conversion,
shader sampling or pixel-storage equivalence is implied. In particular, canonical
native straight RGBA8 must not silently roundtrip through display premultiplied RGBA8.

The 24-case / 408-query fixture compiles actual pinned Krita constructor, selector
and append bodies using metadata-only QImage/QSize shims. Reference source is
GPL-2.0-or-later; it remains private diagnostic compiler input. The application helper
is an independent scalar re-expression and does not vendor native implementation.
Qt reference interpolation tables and pixel kernels require separate conformance.

`sourceImageScaleAxis` independently models the fixed-point coordinate and packed
coverage tables used by Qt 5.15.7 smooth resize. Thirty cases / 4328 entries are
checked against compiled actual `qimageCalcXPoints` / `qimageCalcApoints` methods,
including negative destination-axis reversal. The declared input bounds avoid native
signed-int overflow and bound table allocation; they are not a claim about Qt's
maximum supported image size. Upsampling and downsampling require different pixel
kernels; these tables do not implement either kernel. Native SIMD, rounding,
premultiplication and QPainter transform sampling remain separate proof boundaries.
Qt source carries LGPL3/GPL licensing (and additional historical notices); no Qt
implementation text is bundled in the application helper. Fixture generators retain
source hashes and compile private reference inputs only.

`sourceImageScalePixels` is the bounded straight-RGBA8 adapter around the existing
shared `raster/integerImageScale` kernel, not another resampler. It validates exact
byte count, side/pixel limits and the common 64M-channel-sample work budget before
allocating its premultiplied input. Its explicit scalar/SIMD law never depends on the
executing device; the common kernel defaults to its previous SIMD law. Identity
`QImage::scaled` retains original straight bytes, including hidden RGB under alpha0.
Nonidentity scaling returns premultiplied bytes. Sixty whole-image cases cover both
axes, anisotropic enlargement/reduction, odd sizes and alpha0/1/128/255/arbitrary.
Actual compiled pinned Qt5.15.7 scalar/SSE4 bodies independently check both laws;
actual host Qt5.15.13 `QImage::scaled` agrees with the SIMD result. Eight cases expose
scalar-vs-SIMD bilinear rounding differences. Android NEON is source-audited, not
executed by this CPU oracle.

The subsequent conversion has a separate proof boundary. The explicitly named
`sourceImageScaleStraightScalar` implements scalar qUnpremultiply and matches the
host with SSE4.1/AVX2 conversion disabled. Default host SIMD ARGB32 conversion has
observable differences (for example premultiplied channel64/alpha128 can become127,
where scalar gives128) due to reciprocal-estimate/Newton and rounding. The fixture
keeps both actual outputs. This adapter does not claim to implement host SSE or
Android NEON unpremultiplication, nor to reconstruct lost straight channels.
A future canonical material profile must fix interpolation AND conversion laws;
peer-local feature detection cannot be a replay rule. No new profile is activated.
This is source-informed mathematical implementation, not a clean-room provenance
or licensing claim; verbatim Qt implementation stays in private diagnostic inputs
with source notices and hashes. QPainter affine sampling remains unimplemented here.

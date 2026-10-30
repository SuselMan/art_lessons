# Isolated author stroke owner

This is orchestration of existing CPU kernels, not a second brush engine. No
production/importer/shared/schema activation or new wire format is introduced.

## API and ownership

`new SourceStrokeAuthor(program)` compiles immutable typed option data once.
`createState(sequentialSeed, perStrokeSeed, initialAngle)` creates explicit source
state. `plan(state, capturedPacket)` and `resume(checkpoint)` return bounded
iterators of `material`, nonpainting `query`, and `inputComplete` events. Each
yield has a frozen structured-cloneable checkpoint, including the pending segment,
role index, interpolation cursor and bounded fan request queue. `sourceAngle`,
`sourceTime` and `logicalSequence` identify the author result without overloading
rendered geometry. These are private CPU fields, not agreed durable fields.

Every atomic query restores the SAME sequential/keyed source pair. Size/Rotation,
Scatter XY, material Mirror, spacing Mirror/Spacing and wrapper Rate all use that
pair. Cache hits do not skip Mirror. No coordinate hash or GPU RNG is consulted.
A role completes its entire segment, including refreshes, before the mask role
starts. Primary and mask share both RNGs but retain independent distance, cache,
seqNo, total distance, max pressure, locked direction and last painted info.

The class has no mutable stroke state, timers or GPU resources. Functional forks
from the same checkpoint are allowed; the authoritative caller serializes its
accepted checkpoint chain. Stopping an iterator leaves caller input unchanged;
resume uses the last yielded checkpoint. Query events must never become fake
zero-opacity dabs. No draw is repeated merely because the consumer yields.
The caller owns live-render cancellation/rebuild and persistence ordering.

Reused kernels: compileSourceOptionProgram/sourceSensors/sourceOption;
SourceStampQueryExecutor/sourceScatter/planSourcePngDab;
sourcePngCharacteristicSize; SourceDistanceTiming/sourceTimingInterval;
sourceDrawingDirection/sourceFanRequests. Added laws are the missing orchestration
and native registration, and effective-spacing adaptation of resolved query values.
No existing stochastic, spline, cache or distance algorithm is duplicated.

## Pinned native law

Krita `bd6e8d061d2f0388c5b10278786cf0fe62e3135f`:

- `libs/image/kis_paintop_utils.h:55`: distance/time loop, fan before normal request,
  then separate needsSpacingUpdate/needsTimingUpdate queries at segment endpoint.
- `plugins/paintops/defaultpaintops/brush/kis_brushop.cpp:103`: paint query order;
  `:371`: updateSpacing Size/Rotation; wrapper timing follows early returns too.
- `plugins/paintops/libpaintop/kis_brush_based_paintop.cpp:166`: spacing Mirror,
  characteristicSize(scale,ratio1,rotation0), then spacing option/utility.
- `libs/image/kis_paint_information.h:100`: register context, paint, timing, lock
  drawing angle, then registerPaintedDab even if paint body returned early.
- `libs/image/kis_paint_information.cc:447`: maxPressure is
  max(last registered pressure,current request pressure), BEFORE paint registration.
- `libs/image/kis_distance_information.cpp:382`: register only after paint;
  seqNo++, logical-point distance/LOD, last info, angle, maximum pressure.
  Unpainted endpoint queries do not register the incoming maximum permanently.
- `KisMaskedFreehandStrokePainter.cpp:28`: whole primary callback then mask.
  `material-child108-ownership.md` records shared source pointers and independent
  per-painter distance/cache; no separate child seed is invented.

Normal/fan scalar mixture uses `(1-t)*a+t*b`. Fan position geometry alone is
explicit `a+t*(b-a)`. Reusing those point coordinates for scalar pressure/time is
not equivalent in F64. Normal drawing direction is evaluated after preceding fan
registration. The scalar rounding regression uses existing native time-mix input
(.1,.3,.25), whose result differs from the alternate expression.

## Native proof and remaining boundary

`fixtures/sourceStrokeAuthor.native.json` records an independently executed C++
query scheduler: unchanged native paintLine, paintAt, distance, option component,
Mirror.apply and Scatter.apply bodies. It uses recorded actual Boost seed0 raw
values from nativeRandom.vectors.json (not TS-generated oracle values). Three
inputs exercise tiny early return, stationary50ms query and subsequent paint:
17 events,12 draws,2 registrations; TS event order, counters and values agree.
C++/source hashes and raw inputs are recorded. Geometry extent/material are
explicit shims; Opacity/Flow are fixed1. This does not prove PNG placement pixels,
actual full KPP loading, cache worker scheduling or the entire native stroke image.
The unchanged cache/geometry kernels retain their separate native fixtures.
C++ source/reproducer script are retained in R46/sourceStrokeAuthor.query-native.cpp
and sourceStrokeAuthor.native.py; compiled disposable was removed by root through standard locked cleanup after
strict /proc validation, receipt fixes-v49/native-source-author-cleanup.json.
No temporary resource remains.

The primary #84 diagnostic with actual source option data demonstrates why query
ownership matters: an omitted spacing refresh shifts Size from draw4 to draw0,
producing scale .259770 vs .000490 and 30x31 vs1x1 requested source geometry in the
recorded seed0 boundary example. That diagnostic is composed TS kernel evidence,
not the independent native whole-stroke oracle or current production pixel output.

Tests run all nine existing primary PNG option programs (84,103,105,108,110,111,
112,113,114) through one owner, plus cache-hit Mirror stages, keyed sharing,
primary/mask segment ownership,1000-request catchup, arbitrary checkpoint fork,
clock, scalar fan mixture, caller immutability and malformed-state rejection.
The child108 topology test uses explicit independent child time period6340 but
is not admission of its full saved master-size/curve/material configuration.
116 colorsmudge/GIH has a distinct source strategy and remains unsupported here.

## Explicit limits before engine integration

- Host provides normalized native sensor packets, source elapsed dispatch clock,
  initial history direction, resolved native brush sizing and fixed material
  identity. There is no KPP reader, UI normalization, wall-clock read, floor,
  retime or guessed child master-size conversion in this owner.
- Only PNG fixed Softness1/Lightness1 and audited RNG-free material generation are
  admitted by this private program. Unknown active material consumers fail before
  stroke execution. Native texture/sharpness pixels, color source, outer blending
  and cache bitmap generation are separate renderer/material responsibilities.
- Circular interpolation of varying pen rotation is explicitly rejected. Current
  nine option fixtures do not use the rotation sensor; the owner does not silently
  linearly interpolate a circular native channel. Hover transitions are rejected.
- Program ID is caller-owned immutable descriptor identity, not a new hash/wire
  security boundary. Checkpoint guards validate bounded structure, packet/cursor
  enums/counts, finite nonnegative counters/spacing/distance and RNG snapshots.
  Positive infinite native timing interval is intentionally accepted: the reused
  DistanceTiming law clamps it to LONG_TIME when consumed. Keyed snapshot restore
  verifies cached values with deterministic one-time computation; it does not
  advance the stroke's sequential source.
- This is not Samsung/iPad performance or image parity proof. No legal clearance
  is asserted by source-informed mathematical orchestration. Upstream source
  excerpts remain in the native research evidence, not imported production code.

## Default-auto geometry strategy

The same owner now accepts explicit default-auto-fixed1-rng-free with tagged SourceDabGeometry; no image/CAS context or second scheduler. Virtual characteristic size/hotspot/mask extents dispatch through existing native-auto laws and saved generation data, preserving raw angles. Actual compiled stock7×30pressure packets resume identically at every yield; existing PNG native query/RNG/cache fixtures remain unchanged. See sourceDabCache.auto.provenance.md for exact cache source seams, independent proof boundary and image-only codec guards. This is author capability only, not activated canonical drawing or full-brush compatibility.


## Gaussian author/query/cache extension (source-data only)

The `gaussianAuto` geometry tag uses the SAME author cursor, nine compiled option
programs, source stamp query executor, distance/timing owner and dab cache.
There is no Gaussian-specific random stream or query schedule. SourceStampQuery
already passes the tagged SourceDabGeometry through; its arithmetic is unchanged.
Default material policy stays `default-auto-fixed1-rng-free`; the explicit Gaussian
policy is `gaussian-auto-fixed1-rng-free`. Scalar profiles remain distinct:
`scalar-bionic-f64-fma-v1` is Gaussian, `scalar-f64-fma-v1` is default.

Geometry calls reuse sourceAutoGeometry's proved auto-brush window law; the profile
name of that common law does not assert default-generator coverage. Original
Gaussian whole-wrapper104 fixtures separately prove this reuse and Gaussian
raw-angle processing. Cache equality binds kind, source fields and coverage profile;
cache hits retain SAVED source shape/angle/subpixel inputs rather than current
request values. Checkpoint validation checks the tag/profile/window before RNG.

Actual imported fixture13 has only seven source-data author-capable descriptors
(#2,5,6,7,10,11,22). Three material consumers (#12,68,70) and three dual brushes
(#38,39,40) retain their capability fences. Geometry is generic for all13, which
does not grant those six author programs or eraser/renderer semantics. Tests run
both supported coverage profiles, thirty pressure-varying packets, whole versus
structured-clone resume at EVERY yield, and compare all steps/RNG events. Actual
brush storedScale remains1; this is not a UI effective-size override proof.

The Gaussian coverage profile is closed to raw generator ratio <=1 (larger raw
ratios may be retained as data but are rejected before author RNG).

No material/codec/prepass execution is activated here. Adapter rejects Gaussian
programs and trusted pins before asset lookup/build, and rejects injected Gaussian
material recipes. Old saved-source PNG plan/prepass routes reject the tag before
PNG geometry and before compatible warmed cache hits. Existing image/default
fixtures must remain unchanged. Gaussian mask pixel identity remains the scope of
the independently retained whole-wrapper104 fixture, not these author tests.

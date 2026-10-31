# Seeded density actual material consumer — phase B

This consumer is explicitly selected by committed coverage
neon64-f32-fma-seeded-density-v1. Existing raster/composition kernels are unchanged;
no server/default execution policy, Room, UI or online descriptor grant is opened.
Only defaultAuto primary role is supported. Same executor receives already accepted
decoded original frames; seed helper is now used by a real existing pixel path.

CanonicalFrameExecutor.maskRequest derives identity from immutable original
input.gestureId, trusted source descriptorSha256, primary and composition drawOrdinal.
That ordinal was assigned at enqueue BEFORE clipping. It is independent of frame
packing/control-only frames. No pointer replay, author option RNG, wall clock or
new per-gesture random registry. Material revision uses pinned profile/source/recipe,
uint32 derived seed and ordinal; request.owner already separates executor owners.
Hash collisions imply identical mask realization under this declared law and do
not convey authority. Repeated request identity can reuse its exact derivative;
a later physical ordinal changes revision. Full trusted identity is captured/frozen
in existing pendingAuto/slot material, not inferred from geometry or a seed alone.

prepareSourceSeededDefaultAutoDab wraps SAME existing neon coverage evaluator. It
passes density1 ONLY to the mathematical base-coverage stage, while original
source pin/recipe retains real density for the separate post-A8 thinning stage.
No cast of new profile into old arithmetic or alternate coverage implementation.
The wrapper advances either base samples OR density visits per call, never more
than supplied maxSamples TOTAL. A base-written span is not reported written until
fully thinned. It temporarily borrows the same A8 target span across yields, checks
target/offset identity, and reports completedPixels only for finished output. It
retains no full mask plane. Transparent pixels consume no random values, but still
count bounded density visits. Density1 directly uses unchanged base evaluator and
consumes no density samples/work. Cancel/continuation failure drops the span and
cancels underlying generator while preserving first error. Prepass remains the
single pending-work owner and uses its existing stripe RGBA packing/upload/release.

Storage: original prepass <=16384-pixel A8/RGBA stripe sizes and GL allocation
budgets are unchanged. SAME fixed BrushMipCache reservation now conservatively
includes retained identity max UTF16 bytes (2*MAX_SOURCE_DENSITY_GESTURE_ID+512)
per slot plus one worst-escaped JSON hashing temporary allowance
12*MAX_SOURCE_DENSITY_GESTURE_ID+1024. MAX is exported once by seed helper (8192).
Pending sampler/span metadata adds512 to existing stripe reservation. These are
bounded estimates sharing existing CPU quota, NOT proof of actual JS heap limits
or reclaimed memory. Fixed budget is intentionally more conservative even when
slots currently serve old materials; no independent ledger/quota/lease registry.

Tests-first three failures before consumer, final165 tests/7 suites PASS with
maxWorkers1; lint0/diff PASS. New six tests prove total per-call sample bound at
1/37 samples, independent stripe sizes/full-mask expected result, repeated physical
ordinal differentiation/cache hit identity, full multi-stripe mask upload capture,
actual executor clipped first draw then visible ordinal1, zero-draw frame invariance,
missing/mismatched identity/mask-role rejection, pending-span cancellation/retarget
poisoning, upload failure cleanup, density1 byte identity/base work, maximumidentity
compact revision and budget failure BEFORE GL allocation. Existing soft40 fixture
masks and default evaluator/executor regression suites pass unchanged.

Host expected masks combine unchanged base-coverage reference with committed density
helper and the reused request-local seed/RNG law. recordingGL observes actual
texSubImage2D A8-derived RGBA stripes and SAME executor scheduling; it does NOT
execute real GPU composition or establish final hardware RGBA/native GUI identity.
The actual executor proof uses built/decoded original frame fixtures; phase A
separately proves normal descriptor→author→adapter→encoder, explicitly synthetic.
No Marker_Dry/native random-realization/physical pen latency or all118 claim.

Logs: R52/density-consumer-first-red.log and density-consumer-regression.log.
Phase A commit1a353eefc, shared2b804a7e3; final app/server/source/maps pending ROOT
joint gate at sourcefreeze. No own device/context/process/runtime remains.

Type follow-up after joint90960: seeded base tip explicitly carries validated
randomness0; wrapper tip TYPE allows density:number only for the new explicit
coverage, while old base tip remains density1. Existing sourceStrokeAuthor.auto
fixture rejects newcoverage before using its old evaluator domain. Targeted TS
under actual parsed app options (Plan/newconsumer/oldfixture roots and original
app .d.ts declarations) PASS52704; scoped17 tests/3 suites PASS, lint/diff PASS.
This is not a full app gate; fresh ROOT full app remains required.

Final ROOT receipt: full app11968 PASS after frozen type corrections; server
source/SW/maps and independent85 integration tests PASS. PhaseB runtime/storage
review accepted. No real-GPU density/native Marker_Dry proof or online grant is
implied by these host/type gates.

# Soft source in the existing transformed-mask prepass

`CanonicalAutoMaskMaterial` remains kind `canonicalAuto`, with a paired soft
recipe/trusted-source/program-owner branch. Existing default/Gaussian material
branches and their revision stay unchanged. Soft revision includes the entire
validated immutable source pin and recipe, including sourceSlot, descriptor,
reader/compiler/build identity, raw curve/corners, coefficients and signed zeros.
This key is identity for the bounded slots, not a compiler attestation.

`prepareCanonicalAutoMask` checks the shared soft recipe/source cost, borrows an
already prepared fixed-source owner, verifies exact numeric tip, points and
coefficients, and calls the existing `prepareSourceSoftCircleDab`. There is no
soft table compilation in this path and no second raster body. Corner flags
remain in the raw trusted pin; the numeric polynomial is compared after
projecting points to x/y. Incomplete or retired source ownership rejects acquire.

The same pendingAuto record holds evaluator, RGBA stripe and program lease across
yields. Hits and resumes precede evaluator construction/acquire. Stripe admission
or evaluator construction failures release the program borrow. Done detaches
pending ownership before cleanup; cancel detaches then attempts evaluator cancel,
stripe release and program release. Cleanup attempts preserve the original
preparation/generation error. An owner retired while pending retains its CPU
reservation until completion/cancel releases the last borrow. Completed GPU slots
retain no program borrow. The caller owns fixed-source retirement; prepass reset
cancels the current borrow but cannot retire a caller-owned source.

Validation: five new tests pass all40 original scalar/NEON masks and40864 A8 bytes
through64-sample bounded evaluation and RGBA stripe capture, check no acquire on
slot hit, yielded retirement/cancellation/upload error balance, full pin revision,
wrong polynomial rejection, stripe admission failure and first-error retention
through throwing program-release notification. Two-slot regression verifies
releaseOwner clears completed owner slots despite a throwing pending cancellation. Existing45 Plan/Prepass tests pass.
Targeted oxlint passes. Common web TSC remains the coordinator's integration gate.
No device, browser, service, dependency or temporary runtime was created.

## Fresh Samsung integrated executor proof

Current source was bundled in memory and executed on SM-T970, Chrome156,
ANGLE Adreno650, using the actual packed-V2 decoder, executor, prepass, tiled
layer and fused scalar compositor. Four cases cover `scalar-f64-fma-v1` and
`neon64-f32-fma-v1`, each wash/buildup, each two gestures. Every gesture uploads
all437 independently recorded native A8 pixels as identical RGBA replicas;
all65536 final RGBA bytes across four64x64 outputs match the host fused-scalar
oracle exactly. Table preparation takes four quanta of at most64values per
source and zero additional quanta for the second gesture. Never-used source
cancellation returns its reservation. GL errors and poison notifications are
empty, nontrivial incoming GL state is restored, and all owned GL handles and
CPU/GPU reservations return to zero.

The instrumented follow-up found executor turns still exceed their cooperative
budget: cold maxima17.8–37.6ms and second-gesture maxima11.7–24.4ms. Table
advance maximum0.4ms and mask advance maximum3.2ms do not explain the long
turns alone. One cold NEON wash turn includes nine getError calls totaling13.6ms,
composite drawSource5ms and cold target resolve3.9ms. These are inclusive
host-visible timings, not GPU timers; nested span sums must not be added.
Service setup1.24–1.30s is outside executor.advance. Responsiveness remains open.

Compact private receipt: R52/soft-executor-device-receipt.json, with exact source
snapshot, bundle/body/fixture hashes, per-turn top calls and cleanup. Both own child/context and forward19236 were removed, all three original tabs
retain their IDs/URLs, parent restored, job marker removed. No frontend/backend,
service, dependency or disk bundle was created. This proves the isolated native
basis executor path, not active UI/author compilation or native GUI whole-stroke
identity.

## Shared turn budget: actual multi-target Samsung comparison

Scheduler source commit `7f7fc418d` (executor body SHA256
`30c926a0b033273513f83428e01b94ed23d36d97abd05af68f8c45515e9e0abb`)
was compared with executor-only source from `ad5923fbd` (body SHA256
`7713595943316a3de47fd0b800b519b3af149437f128ce5a2918bde09396d9e7`).
The before executor was overridden only in esbuild memory; checkout and every
other source remained identical. Same fixture/body hashes are in the compact
R52/soft-multitarget-comparison-receipt.json receipt.

Two NEON cases (wash/buildup), three gestures each, place the unchanged native
19x23mask at60,60 across four64x64tiles on a128x128page. Before cold allocation
creates four new layer targets in one executor turn per case; after allocates
one new target per turn, four turns per case. Both allocate exactly four targets,
retain four resident tiles and preserve all131072 final RGBA bytes across the two
outputs. Native mask replicas, incoming GL state, cold source cancellation,
second/third gesture table reuse and all cleanup gates pass for both versions.

Last instrumented pass: all-turn median/max15.9/42.0ms before and9.7/26.9ms
after; cold11.0/42.0→10.7/26.9ms; warm17.2/27.1→8.6/11.7ms. Another multi-target
pass varied, including buildup maximum30.5→36.2ms. The earlier single-target
comparison showed no overall win (all-turn max37.6→47.9ms). The demonstrated
improvement is cooperative cold allocation granularity4→1, not an overall speedup
or hard4ms guarantee: driver calls cannot be interrupted. Measurements include
instrumentation and are not active UI frame timings. All own children/contexts,
forward19236 and job markers were removed; original three tabs retained IDs/URLs.

## Actual imported Airbrush source pipeline

Actual compiled NEW-KPP input SHA256
`721d0c7ca7245dd3b561a6fa4a0d5974035d196e4ab4f497c016072c19600c13`
contains six source descriptors. Only index3 Airbrush's native normal outer blend
is covered by this completed integration proof. Indices59..63 require color,
colorDodge, lighten, multiply and overlay; their unsupported binding guard is
pending verification in this receipt, and no six-brush compatibility is claimed.

Index3 runs through the actual binding, descriptor compiler, seeded author,
material adapter, encoder, decoded frames and Samsung executor in both scalar
and NEON profiles. Two ordinary packets (pressures.2/.6; seeds4321/7654/.3)
produce one draw/four frames under original spacing. Input coordinates are chosen
from the dry dab hotspot to expose the edge of the unchanged600x600mask on a
64x64page:9/10 distinct visible A8 values,2798/3038 partial-alpha pixels for
NEON/scalar. No recipe or resolved scale is changed after authoring.

Full64 and partial8 compositor capacities, each original plus fresh-layer replay,
produce eight outputs/131072RGBA bytes identical to the independent existing CPU
mask/composition oracle. Per-profile SHA256 agrees across replay and capacities.
Partial8 retains the same program owner, CPU cache, GL context and scratch pool:
38 table quanta initially, zero on replay. Executor cancellation retains the
borrowed40608byte estimate; caller retirement returns it; all reservations, pool
bytes and GL handle counts then reach zero. GL errors/poison empty, state restored,
three original tabs preserved, own child/context/forward removed. Compact receipt:
R52/soft-airbrush-actual-source-integration-receipt.json. This is the explicitly
recorded creamy/OVER material pipeline, not original GUI whole-stroke or active
pointer responsiveness proof. Other native outer operators remain required work.

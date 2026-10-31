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

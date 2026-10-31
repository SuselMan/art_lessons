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

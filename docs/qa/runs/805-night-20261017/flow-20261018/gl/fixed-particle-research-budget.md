# Particle admission limit vs actual saved choice

Blocker: original `wgsl-macro-paper-particles`, config{}, mini-wave upload
estimated1,638,817,433 environment reads >128,000,000. This is a CPU admission
policy, not memory exhaustion or the fixedpoint overflow bound. The old max
config override is capped500M, so it cannot admit this same saved choice.

Fixed-policy-only research factory keeps samples8,steps32,stepPixels12,
paperGain4,persistence2 (or actual explicit config), sourceIndex/seed, complete
trajectory/splat/atomic body and original PACK. No new model or reduced work.
Ordinary factories and historical default admission limit remain unchanged.
Research execution is separate metadata, NOT an algorithm-config override.

Execution policy: total estimated loads<=32B, each dispatch<=8M worst-case
loads. Uniform blocks are separately aligned immutable slots in one buffer;
all writes precede submission and no chunk observes a later mutable offset.
Clear is submitted once; every walk chunk has its own ordered queue submission;
PACK is submitted once after all walks.
Baseline maps source indices directly; compact/safe retain the ORIGINAL
occupied-index list. Every source/list entry appears exactly once. Accumulator
is cleared ONCE and packed ONCE after all chunks. `chooseParticleQuantum`
continues to bound GLOBAL alpha units<=0xffffffff; premultiplied channels are
bounded by alpha. Therefore atomic integer addition cannot wrap, and reordered
concurrent additions commute. Float trajectory arithmetic is literal unchanged;
actual GPU output equivalence remains a device gate, not a CPU claim.

`fixed-particle-research-work.json` independently SHA-verifies all30 immutable
inputs and computes current saved defaults. Maximum safe estimate4,741,459,932,
mini-two-colors; all below32B. Estimates count worst-case reads, not measured
memory traffic/time. Shader early exit/cache can lower actual work.

Added dispatch/uniform overhead means timings are chunked research timings,
not original single-dispatch timings. The cap bounds each dispatch; it is NOT
a formal driver watchdog guarantee or a promise that host cancellation aborts
already submitted GPU work. Owned runner timeout/context cleanup remains
required. Do not run this build into a concurrent active device queue.

CPU:4 focused tests +92-choice actual factory/source coverage PASS; strict TS0.
Tests verify source coverage/no overlap/tail guard, literal trajectory+PACK,
immutable uniform offsets/values, allocation-free run and exact own cleanup,
32B rejection before GPU writes and global atomic no-wrap bound.

Required coordinated v3 GPU gate: mini-wave/sheet12/thinwall for each particle
variant, repeated fullRGBA equality; on an admitted small fixture compare old
ordinary factory vs new chunked output EXACT. Input/source SHAs, raw dry/premul,
chunk bounds, selected config and all quantization limitations remain explicit.

## Narrow v3 device-loss follow-up

`final-particle-v3-large-results`: first9cases passed, safe mini-two-colors lost
GPUDevice during mapAsync; ordinary/compact fourcases each and safe mini-wave
passed. Small old-vs-chunked comparison all3fullRGBA exact. This localizes a
heavy execution failure, not its driver cause. Old execution encoded all128M
chunks into ONEcommandbuffer; current patch reduces to8M and submits each
separately, keeping immutable uniforms, source body and accumulator unchanged.
FourCPUtests verify one clear submission +one per walk +one finalPACK, exact
coverage, unchanged shader arithmetic and cleanup. This is not a guarantee
that a device watchdog will accept the total workload; actual safe mini-two-
colors retry first is required, then remaining safe sheet12/thinwall and repeat.

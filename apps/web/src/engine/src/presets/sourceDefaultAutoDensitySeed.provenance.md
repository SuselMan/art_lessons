# Request-local deterministic density seed (paired consumer)

This is a pure engine helper, not a shared profile declaration or execution grant.
The corresponding reviewed sourceDefaultAutoDab/TransformedMaskPrepass/Executor
consumer now uses it under explicit density coverage. No online execution grant
is implied. This helper is committed only together with that meaningful consumer.

Exact domain: `neon64-f32-fma-seeded-density-v1`. Seed is existing
`qt5QStringHash(JSON.stringify([domain, gestureId, descriptorSha256, 'primary',
drawOrdinal]))`: JSON tuple delimiters/escaping and decimal safe integer spelling,
UTF16 code-unit DJB31XA hash. SHA is lowercase64hex; original gesture identity is
nonempty/no NUL/max8192 UTF16 units; ordinal is nonnegative safe integer; role is
primary only. Hash collisions are possible and convey no source authority.
No new PRNG: a fresh existing `KritaRandomSource` Taus88 is created for each
request. Its constructor maps seed0 to [2,8,16], first raw output2105472;
normalized generation divides uint32 by 0xffffffff, allowing both0 and1.
This is Grafetto deterministic behavior, not native applicator seed identity.

The caller must provide the genuine original-stream identity. Current
CanonicalWashLayerCoordinator builds the same local/recorded tuple from
roomId/boardEpoch/userId/strokeId. SourcePrimaryComposition assigns cumulative
accepted material drawOrdinal before clipping, independently of frame packing
and zero-draw frames. This helper does not mint or validate that provenance;
source owner integration is provided by the paired executor maskRequest path. No author RNG is referenced.

Hardcoded golden hashes and first three raw outputs were independently computed
with Python integer arithmetic over explicit UTF16LE units and masked32bit Taus88
transitions, then compared against the reused TypeScript primitives. Witnesses
include adjacent equal-shape ordinals0/1 and a Unicode/escape tuple at maximum
safe ordinal. Existing nativeRandom fixtures remain unchanged. Tests also cover
alternate accepted draw packing, empty frames, density cursor chunking, different
holes for successive equal dabs, regeneration and distinct mutable request owners,
snapshot restore, bounds and mask-role rejection. These are behavior tests, not
an installed ARM/native GUI random realization oracle.

Tests-first missing-module failure recorded R52/density-seed-first-red.log.
Final 53 tests across seed/density/nativeRandom suites pass with maxWorkers2;
no shared profile opening or production caller changes. Joint31013 full app/SW/server source TypeScript and map:check/map:rules pass.
Logs R52/image-baseline-gih-seed-joint-*. No devices, runtimes or new resource owners were created.

Paired phaseB165tests/7suites PASS; final joint app typing pending ROOT gate.
MAX_SOURCE_DENSITY_GESTURE_ID exported once for validation and fixed prepass slot
CPU metadata allowance. Domain now reuses the identical shared profile constant;
all original seed/raw-output goldens remain unchanged.

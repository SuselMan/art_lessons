# Opt-in bounded density stage

This helper processes an already quantized caller-owned A8 plane in place. It
adds no descriptor admission, material policy, cache path, renderer or online
capability. Existing `prepareSourceDefaultAutoDab` and `sourceDefaultAutoDab`
callers are unchanged; their density-one restriction remains in force.

Retained pinned Krita source (bd6e8d061d2f0388c5b10278786cf0fe62e3135f):
`standard-tip-v29/sources/kis_brush_mask_scalar_applicator.h` quantizes coverage
before density, samples only nontransparent pixels, and keeps iff
`density >= generateNormalized()`. Thus density zero may keep a sample exactly
zero. Density one consumes no random values. `fixes-v43/native-xy-edge-source-kis_auto_brush.cpp`
passes density to the applicator and disables caching for density unlike one.
The applicator owns its own `KisRandomSource`; this helper's explicit sampler is
not the stroke option RNG and does not claim native seed/sequence identity.
Paths are relative to retained `temp/device-runs/krita-stroke-20261024` evidence.

Real mechanism witness: original index23 `e)_Marker_Dry`, KPP SHA256
`16ff0d722e2b958217f33dd3c5dbb74d7d04d67c8f07663e7622e3b2ccc34f5b`,
default rectangle35/ratio.5, density.8/randomness0. This is not admission of that
whole preset: its descriptor/author/cache integration remains closed.

Cursor state is private per invocation; the caller exclusively lends the plane
and owns sampler state. Each advance visits at most its supplied positive safe
integer pixel bound, including transparent pixels. The plane is capped at 1MiB
before work; the helper allocates no additional image plane. Sampler failure
poisons the cursor and preserves the original thrown value, preventing accidental
retry consumption. Invalid sample values reject without modifying that pixel.
No timing/performance or heap-reclamation claim is made.

Tests-first: four new tests failed against the missing helper. Final 10 tests in
two suites pass (six new density behavior tests and four unchanged existing dab
tests), maxWorkers2; lint and diff check pass. Tests cover equality at .8 and0,
visible-pixel sampling, density-one byte identity/no RNG, caller-seeded chunk
independence, mixed hole coverage, bounds, empty plane, invalid samples and
failure retirement. R52 logs: `default-density-first-red.log` and
`default-density-regression.log`. Common TypeScript check pending coordinated
joint gate; no device run or native pixel-parity claim.

A private busy guard rejects sampler reentry before nested work, with finally
restoring the guard. Caught inner errors allow only the outer bounded work;
uncaught errors poison the cursor with the exact original value (including
undefined). Finished advances consume no samples.

Coordinated joint24042: full app and SW TypeScript checks pass. Architecture
map:check fails on sourceImagePipe README frontmatter and Room/index.tsx line
budget; fail-stop map:rules was not run. Logs: R52/density-predicate-bank-net-joint-*.log.
These metadata failures are outside this unit; no overall architecture gate PASS claimed.

Final gate receipt from ROOT: after separate architecture documentation repairs,
map:check and map:rules56021 pass (0 errors,24 warnings,11 known ignored).
Full app/SW24042 already passed; production sources unchanged, no repeated TSC.
Architecture documentation fixes are excluded from this unit commit.

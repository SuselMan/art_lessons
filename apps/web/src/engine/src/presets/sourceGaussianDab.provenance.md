# Closed whole Gaussian dab CPU service

`sourceGaussianDab` composes existing sourceAutoGeometry, the generic native-law
sourceGaussianCoefficients constructor, and the single resolved Gaussian coverage
body. It introduces no second geometry, coefficient, or mask implementation.
It remains off importer, descriptor, author, cache, wire and GPU hooks.

The geometric function's existing `default-auto-qt5-arm64-f64-v1` identifier is
preserved. That function describes the common original KisAutoBrush whole-dab
geometry, not the Gaussian coverage arithmetic. Its inputs include stored brush
scale and normalized angle. Coverage instead uses shape.scale, shape.ratio,
raw shape.rotation + storedAngle, and center = hotspot − .5 + subpixel. Those
separate contracts are verified against all104 original whole-Gaussian calls,
including stored scale and rotations distinct from shape. All29,098 A8 bytes,
window sizes, centers, native captured cosine/sine, generator scales and scalar
vs NEON routes match the existing independent frozen fixture exactly.

The API deliberately admits only circle/spikes2, softness1, randomness0,
density1 and explicit scalar-Bionic or NEON profile. Tiny antialiased requests
use the existing scalar supersampling fallback. Math.sin/cos identity is proven
for retained inputs, not as an exhaustive Bionic trigonometric equivalence claim.
Finite coefficient validation and geometry/output/work reservation checks happen
before the one fresh caller-owned A8 allocation. Caps:1MiB A8,4096 per dimension,
16M work samples. The synchronous CPU fallback has no cache or lifecycle owner.
`prepareSourceGaussianDab` now retains a single full-geometry sample cursor;
scalar supersample sums survive yields inside pixels, while vector-tail rounding
uses original global x/width regardless of output stripe boundaries.
The synchronous wrapper drains that SAME arithmetic stream. The cursor owns
validated scalar/coefficient inputs, supports explicit cancellation and reserves
no output plane itself. Each advance limits work samples and target capacity.
A common sourceCoverageEvaluator lifecycle is shared with default-auto, with
no shared coverage arithmetic. All104 native masks remain byte-exact through
1/2/7/31-sample schedules and unaligned seven-byte output stripes; tests cover
native1/36 routes and a synthetic9-sample continuation request (not a new native
oracle), input mutation, invalid continuation and midpixel cancel. No installed GUI factory selection or complete physical-device equivalence
is asserted. Source-informed GPL/elementary-function notices are in the reused
modules and their provenance files.

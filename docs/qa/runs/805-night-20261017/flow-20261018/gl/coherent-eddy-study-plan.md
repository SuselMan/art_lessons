# Bounded coherent-parameter image study (existing V18 source)

CPU preparation ONLY; no GPU run or new prototype/model. Private registered
flow cache contains `functional-v18-eddy-study-cases.json` and matching
`functional-v18-eddy-study-plan.json`. Schema copied from actual V16 quality
cases: algorithm/encoding/repeats/measureTransport/exportRaw/fixture/config.
Algorithm `wgsl-macro-coherent-safe-dither`, optical-density, three repeats,
transport metrics and full raw export enabled. Exactly36 unique requests:

3scenes: mini-wave, dynamic-stroke-through-pool, dynamic-two-strokes.
For EACH: eddyCells4/8/16/24 ×curlStrength32/64/128.
Fixed steps256, mobilityGain3. No additional adaptive or per-fixture settings.
Fixture input seed805 comes from actual captured loader/synthetic fixture
builder (not an ignored request.seed property). Packing hash remains fixed0.

The private plan binds case bytes by SHA256 and records frozen V18 manifest/
worker SHA256, input RGB/water/paper SHA256, expected per-case CPU fieldSHA,
normalizationPowerOfTwo/maxFaceRate, plus curation and timing qualifications.
Expected fields are CPU predictions; compare actual fixture/fieldSHAs before
attributing differences to parameters. No raw input arrays enter this note.

## Spatial and amplitude interpretation

Coarse grid128 on1024 means8fine pixels/cell. eddyCells4/8/16/24 correspond to
PRIMARY noise lattice spacings32/64/128/192px, not literal eddy diameters.
Secondary smooth noise uses twice spacing, capped64cells; lowpass paper and
boundary taper also influence the field. This is procedural artistic motion,
not a calibrated CFD velocity field or an assertion of native watercolor scale.

Every vertex field is globally normalized by ONE power-of-two before strength
and converted to exact discrete curl faces. Strength32/64/128 scales vertex
potential approximately1/4,1/2,1; maxFaceRate remains<=256 and velocity fraction
uses denominator512. Smaller eddies can trigger a larger normalization divisor;
same strength does NOT mean equal RMS velocity across eddy choices. Read actual
metadata field stats/SHA rather than assuming amplitude from the label.
Water upwind/saturation/donor/capacity gates further change actual material
motion, which is not guaranteed divergence-free. No physics code changes.

## Operator gate and curation

Run ONLY after parent/sole GPU operator approves positive V17/V18 smoke and
hands off the current device. Author creates no device contexts or services.
Same frozen V18 build, existing owned-runner lifecycle,108nominal repeated
runs. Existing worker sample boundaries retained: transport, fullRGBA export
and PNG outside timing; totalReady is not silently renamed pureGPUtime.

First reject errors/nonrepeatability/premul or capacity failures. Then inspect
all three scenes jointly: retained stroke details, genuine wet-pool interaction,
two-color mixing, fine paper vs uniform speckle, periodic tongues/replicas,
edge/banding and pixelation. Time/spread/mixing metrics help explain images;
none is an automatic art-quality objective. Select at most2–3 complementary
settings, record failures and tradeoffs; do not announce a numerical optimum.
Compare same-scene original/native and existing V18 controls with honest
algorithm/timing labels. Raw outputs belong in registered private cache and
follow existing operator retention/cleanup policy; never base64 in Git.

Frozen worker SHA256: `754faf708774fe752508a195c8728e3406f610058a72f60f2997e3fa03bf9e30`.
Cases SHA256: `05edafaece1b5ce2a4aebeba69335eb8e56490d1a645f2eee3603bb3bcbb21f4`.
CPU schema/uniqueness/bounds/seed checks PASS36/36; no GPU run.

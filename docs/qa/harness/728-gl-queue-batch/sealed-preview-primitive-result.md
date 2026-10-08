# Synthetic preview primitive: limited positive, wrong real-water pack found

Surface raw `temp/device-runs/sealed-preview-primitive-surface.json`:
readonly original8 SHA exact, GL0/context alive; initial pigment60 cells,
after16diffusion334 cells. Q8 alpha mass5750→5583, −2.904%, not conserved.
Separated right pond receives zero mass. Footprint-only control60→67cells,
limited edge quantization. Reset/cancel performed, real GLfinish before release.
Pre2148/min2018/postclose2028MiB; own target CLOSED and Surface RELEASE.

**This fixture used synthetic solvent B=A, R=0.** Reviewing the actual GL
source exposed that solvent pack is instead R=A, G=B=0: solvent nib uses
inkWater1/paperWet0/inkStrength0, shader1448 writes amount*[1,0,0,1].
Ribbon587 has the same contract. Therefore the old preview B/A domain would
be EMPTY for actual retained water. This run is only a positive primitive
transport/read-only proof, NOT real-water/domain correctness or Room readiness.

1f10e208 corrects the explicit visual conversion to R/A and the synthetic
fixture to R=A/B0. CPU7tests PASS. Added opt-in full retained V readback at seal:
channel sums/max, bbox, wet count and wet pixels outside pigment footprint.
`RETAINED_WATER_PROBE=1` marks controller timing readback-perturbed. No canonical
or production shader changes. Corrected primitive and actual own400water→70dab
V content must be checked before Room preview wiring.

## Corrected actual-pack RA/B0 primitive

Fresh Surface raw `temp/device-runs/sealed-preview-primitive-RA-surface.json`:
RA/B0 input and R/A-domain conversion now match source pack. Source8 SHA unchanged,
GL0/context alive, initial60→334cells, mass5750→5583 (−2.904%), rightpond0.
Footprint-only60→67; no full-domain expansion with footprint-only input.
Pre2143/min1982/postclose2075MiB, own target CLOSED/Surface RELEASE.
This closes the wrong-channel primitive gate; retained real-water pack/domain
is separately proven in `retained-water-actual-result.md`. Neither primitive
proves Room presentation/canonical endpoint; those are the next bounded gates.

OFF Room entry `diagEarlyPreview=1`/controller `EARLY_PREVIEW=1` wired247315f2.
Awaited prewarm21textures before input, explicit13.125MiB extra. Maximum **three
preview admissions per QA session**, not reusable unlimited pending queue;
retired slots stay owned until session GPUidle disposal. Original5352 unaffected.
One material transport step/globalframe, active pen priority. Detach pending
before exact rebase/land/cancel/contextloss, dispose only after actual fence.
CPU existing installer7 + preview11 PASS; hardware Room still untested here.

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

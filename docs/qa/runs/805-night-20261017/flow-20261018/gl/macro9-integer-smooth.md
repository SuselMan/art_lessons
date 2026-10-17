# Integer smooth reconstruction AND explicit new mixing variant

CPU READY; six tests PASS; strict/noUnused TypeScript0. No GPU run by author.
Old V8 source remains untouched. New `webgpu/macro9-integer-smooth.ts`
exports `integerSmoothDefinitions` with TWO distinct controls:

* `wgsl-macro-integer-smooth-control`: old V8 water/pigment equations,
  mixing flag OFF; only reconstruction changes.
* `wgsl-macro-integer-mixing-smooth`: new bidirectional carrier mixing plus
  slower adsorption, with smooth128/256 and nearest256 configurations.

V8 advection alone is a functional negative for equal-water wet pools:
no pressure gradient means zero water flux and zero pigment transport.
The new model does not disguise this as a reconstruction improvement.

## Reconstruction certificate

For r8: q numerator=2x+1−8, divisor16. Signed FLOOR division (not WGSL
truncation for negative coordinates) gives base; remainder0..15 gives integer
weights. Clamp indices at coarse boundaries; duplicates retain their weights.
Four weights sum256 per fine pixel. Each 1D source column sums128=2r²,
so each 2D coarse texel contributes16384=256r² over the fine image. Therefore
pre-quantization full-sheet mass of EACH channel is exactly area times coarse
code sum. CPU exhausts all columns n1/2/3/128 and r1/2/3/8 including edges.
Positive convex weights preserve range and premul. Integer byte conversion:
(total+32896)/65792, floor, where65792=256*257. No shader float arithmetic,
no saturation. total<=65535*256=16776960; rounded numerator fitsu32.
Final byte rounding is NOT globally mass-exact; measure it separately.

If ANY initial stationary alpha exists, GLOBAL nearest fallback is used.
Bilinear beside literal stationary pigment has no fine capacity certificate.
Metadata.reconstruction and reconstructionFallback explain the fallback.
This can suppress smooth reconstruction for a whole real capture with dry
pigment; it is a known restrictive control, not a hidden quality success.
Whole dry scenes stay literal byte-identical. No static-wall certificate is
claimed for dynamic bilinear: old dry paper is permeable in this model.

## New mixing physics

For each disjoint pair, choose k=floor(64*min(Wa,Wb)/max(Wa,Wb,1)). Each side
sends floor(Malpha*k/256) carrier alpha and proportional rounded RGB. Both
packets are simultaneously subtracted from own M and added to other M.
Unlike net-alpha transfer, this mixes equal-alpha DIFFERENT COLORS.
If either final Mα+Dα would exceed its local cap, halve common k and retry;
seven halvings suffice from64 to0. k0 always satisfies an initially valid
capacity. Four global pigment code sums are exact; packet subtraction and
addition preserve positivity/premul. Zero-water endpoint gives k0.

The water-carry step follows unchanged, then absorption W/128 (instead of
W/32) and two-stage adsorption20/100 (instead of70/100). This is an explicit
new coefficient/model variant to keep mobile pigment available; it is not
an exact optimization. Bounds are no larger than V8, packet numerator fits
65535²+32767. 100000 random mixed pairs verify W+S/four-channel invariants,
premul and local capacity. A whole32×8 coarse pool with uniform W and two
pigment stripes separated by32 fine pixels mixes after256 actual X0/Y0/X1/Y1
phases, preserving all ledgers and >50% mobile alpha. This is functional CPU
proof, not a claim of artistic quality or measured GPU displacement.

A future deterministic dither could use ONE shared integer threshold for all
four channels, preserving monotonicity/premul; it would alter output packing,
not physics. It is NOT implemented and would require byte-mass and image
controls, because stochastic rounding does not ensure exact global mass.

No services, devices, temporary builds or GPU contexts created. Parent owns
all build/GPU gates; old models and registry unchanged.

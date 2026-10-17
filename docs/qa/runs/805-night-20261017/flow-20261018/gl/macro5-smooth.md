# Smooth reconstruction: CPU certificate, not GPU certification

Standalone `webgpu/macro5-smooth-reconstruct.cjs`; four Node tests PASS.
No existing capillary source changed; no GPU run/resources.

For integer scale r, sample q=(x+0.5)/r−0.5 with clamped coarse indices.
The interior tent column has total weight r: samples occur in symmetric pairs
around its centre, whose weights add to one. At an endpoint the clamped half
of the outside tent replaces the missing half of the interior tent; the same
sum r holds (including n=1). Separability gives r² for each 2D coarse column.
Thus reconstruction preserves each of four channel sums times cell area,
is positive, constant-preserving, and preserves the premultiplied cone.
Tests exhaust all coarse impulses including corners at dimensions 1×1,1×3,
2×2,3×5 and scales 1,2,3,8. This is an ideal arithmetic certificate: WGSL f32
rounding and final RGBA8 quantization/clipping remain measured errors.

Current dynamic capillary coarse state stores fine-pixel means. Add literal
`dryOriginal` AFTER interpolation, independently; do not interpolate it. An
all-dry input has zero mobile state and stays byte-identical. Additive fixed
pigment plus incoming mobile can overflow; the helper exposes this without
clamping and the existing output guard must remain. Initial dry is not an
impermeable wall in this dynamic model.

Ordinary bilinear FAILS static-wall isolation: the first sample of a dry
neighbour coarse cell receives positive pigment. Returning raw only in that
cell then loses mass. Do not use this baseline for static wall certification.

Paper multiplication after smooth interpolation is unsafe even with block-
normalized weights: within a block the smooth field is not constant, so
sum(field*weight) need not equal sum(field). Optional symmetric disjoint
fine-pair exchange with common share in [0,.5] preserves positivity, four
masses and premultiplication; exclude wall-crossing pairs. This is explicitly
additional reconstruction redistribution, not the original capillary physics.
A baseline without paper is the clean first controlled quality experiment.

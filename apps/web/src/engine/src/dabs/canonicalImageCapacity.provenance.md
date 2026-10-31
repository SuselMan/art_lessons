# Original image crop workspace capacity

Used by the actual original single-image baseline constructor plan. It grants no
source/room/read authority. The existing closed V2 image pin and original crop,
never the CAS square, determine the unit-scale static native allocation. Storage
uses width+height+2 and existing prepass budget. Every actual recipe independently
matches the source pin and exact canonicalTransformedMaskMetadata geometry before
checking its dimensions against the workspace. Oversized recipes refuse; no
clipping, fitting, recipe rewrite or fallback is performed.

Continuous static rotated rectangle axis-sum is at least its unrotated scaled
side-sum; contraction/additional rotation cannot exceed that sum on one axis.
Native near-integer snapping can undershoot by <1e-6 per axis, phase is <1, and
ceil fits within integer static-axis-sum+2. Fuzzy identity/direct-copy paths agree
with selected level dimensions within their native fuzzy margin in the admitted
<=4096 geometry domain. This motivates a conservative bound, not an exhaustive
floating-point/GPU proof. The mandatory exact per-recipe check is still the safety
boundary and may reject a legal but unproved numeric corner. Ratio/mirrors remain
unsupported; actual Basic6 DrawingAngle rotation is preserved.

Evidence: R52/image-capacity-red.log missing helper tests-first; thresholds log
image-capacity-thresholds.log4PASS. Tests exercise actual Basic6 crop150/.05,
pressure/angle/subphase and explicit pyramid selection, fuzzy identity and near-
integer boundaries with rectangular3x5 and150x150 crops. Pin/geometry mismatch and
unchanged budget refusals are included. The separate35316-case R52 HOST metadata
scan is finite evidence only. Actual engine whole163-frame fixture also checks
every decoded recipe. No pixels, physical memory or device claim from these tests.

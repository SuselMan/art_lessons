# Isolated native PNG affine boundary

No renderer, importer, wire policy or Android compatibility is activated here.
The helpers are source-informed mathematical implementations, **not** clean-room
provenance or license clearance. Actual Krita GPL-2.0-or-later implementation and
Qt LGPL3/GPL reference text remain private diagnostic compiler inputs with notices.

`sourceImageTransformAffine` centralizes existing positive logical PNG geometry
and raw-angle raster matrix arithmetic. `sourcePngGeometry` reuses it and retains
its old API/output; `sourcePngCharacteristicSize` exposes continuous dimensions
before hotspot min1 or integer allocation. Eighty actual pinned native Brush
method cases linked to Qt check this continuous boundary; the existing640 source
geometry/cache cases remain unchanged.

`sourceImageTransformPlan` starts with the **effective raw raster shape**: static
brush scale already applied, angle already negative normalized rotation. It uses
the shared original-source pyramid layout, actual rounded level axes, original
bounds for output allocation, border translation, Qt type-specific inversion and
exact source-delta-before-inversion sampling matrix. Identity copies bypass the
sampler. The translation workaround preserves `fromScale`'s explicitly cached
TxScale type even while coefficients are fuzzy identity; reclassifying the
factory before multiplication would discard the correction and never converge.

`sourceImageTransformSpans` computes AA-off transformed-image coverage. Scale-only
edges qRound; uniform rotated rectangles floor corners onto26.6 and use16.16 edge
starts/increments; general transformed paths truncate corners toward zero26.6.
Clipping is part of the row plan. The existing `raster/affineImageSpan16` consumes
these complete rows; it accepts an optional exact already-biased sampling matrix
while preserving its previous default input/origin behavior. No second sampler
is introduced. The older PM8 helper models another destination format.

Independent proof:

-323 actual Qt5.15.13 opaque image probes /4114 covered rows, including all51 old
 full-dab spans byte-exact, fractional/anisotropic/rotated/bordered clipping cases.
-51 old complete dabs now reproduce RGBA without reading recorded oracle spans.
 AABB sampling instead of the row partition fails case11 by3RGB channels; SIMD
 source-decode/store groups depend on row starts and lengths.
-Actual complete pinned KisQImagePyramid.cpp, linked to host Qt5.15.13, provides128
 complete image references, including32 color/partial-alpha inputs.96 opaque-gray
 original→shared integer resize→border→computed matrix/rows→existing RGBA16 sampler
 outputs are exact. Positive continuous geometry80cases and all128 matrix/level/
 allocation/workaround/inverse metadata are exact.
-Existing affine16 source-decode/store proofs (90 covered-span,90 AVX2-disabled,
 51 complete image cases) remain regressions, not Android execution claims.

At this checkpoint the old mathematical-division SSE store model has one genuine
new counterexample among128 images: two RGB bytes127 versus128 under output alpha0.
All128 final inverse-red/alpha A8 masks are exact, but this does not establish full
straightRGBA fidelity. The counterexample stays recorded; no tolerance or alpha
case is discarded. Exact SSE reciprocal-estimate backend input is a separate
bounded follow-up. Android NEON has distinct products/decode/store and needs its
own actual execution receipts. Slow/perspective sampling and unproven fixed-point
slope domains fail closed. Future canonical profiles must select laws once for all
peers; local CPU detection is not a replay rule. Canonical straightRGBA8 storage
must also remain distinct from lossy premultiplied display conversion.

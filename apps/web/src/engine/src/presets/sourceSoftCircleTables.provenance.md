# Soft-circle radial tables: original compiled Eigen / sampling authority

Source-informed by Krita GPL-2.0-or-later at
`bd6e8d061d2f0388c5b10278786cf0fe62e3135f`, especially
kis_curve_circle_mask_generator.cpp, kis_cubic_curve.cpp and kis_cubic_curve_spline.h.
No clean-room or arbitrary point-solver implementation is claimed.

Five curves cover all10 actual stock soft-circle roles: primary3/44/47/59–63/72
and masking52. All have softness1, spikes2 and AAoff. The constructor chooses
resolution=qRound(max(original generator width,height)*4). Original floatTransfer
has resolution+2 entries sampled at i/(entryCount−1), including native endpoint
clamping. It is not a resampled256-entry sensor table. Native resolution/table
pairs are2400/2402,300/302,240/242,440/442 and220/222.

The retained coefficients and full tables came from original installed ARM64
KisCubicCurve(QList<QPointF>) and KisCurveCircleMaskGenerator constructors, original
SparseLU and floatTransfer under Unicorn FPCR0. Points/count/order were recaptured
through the original curvePoints interface. All coefficients/tables are finite;
exact rational residual checks at knots, C1/C2 continuity and natural boundaries
check the captured solution quality. They are not injected solver-success flags or
an epsilon substitute for the EXACT3610-value table comparison.

The loader binds original libc++ VTT data through actual ELF symbol authority,
including R_AARCH64_ABS64. Bounded allocator/memory/strncmp hooks supply ordinary
interfaces; no curve, solver, table, polynomial or formatting hook exists.
An explicit factory boundary chooses the owned applicator interface; GUI factory
selection and physical ARM execution are not attested. Whole masks use original
source inputs resized for bounded output, while the original large tables remain
unchanged. Native library/tool/code SHA values are in native-proof.json.

Existing sourceCurveTransfer is the SINGLE evaluator. Its omitted optional layout
preserves the256 separate-rounded sensor law (all32 old native tables unchanged).
The explicit soft-mask layout uses supplied native coefficients and the installed
Data::value graph0x42537c..a0: separately rounded x²/x³/b*x², two binary64 FMADDs,
then a separate add of d. All3610 captured F64 values match by Object.is. The
profile never claims to compile arbitrary points through a portable SparseLU
solver. Nonunit softness/curve knot mutation needs its own native solve authority.
No descriptor/importer/author/render/wire activation is added.

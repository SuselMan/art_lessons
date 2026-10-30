# Closed soft-circle raw-program → whole-mask CPU service

Source-informed by pinned Krita GPL-2.0-or-later
bd6e8d061d2f0388c5b10278786cf0fe62e3135f. This is an isolated CPU reference,
not an activated descriptor, importer, source author, renderer or wire profile.

compileSourceSoftCircleProgram requires EXPLICIT authoritative native SparseLU
coefficients with the curve points. It does not solve arbitrary control points.
It reuses the SINGLE sourceCurveTransfer implementation with explicit native
radial layout. The original-resolution table is compiled once, deeply owned and
frozen. Request scale/stored brush scale never resample or rebuild that table.
Caller table reservation is checked before allocation (maximum16384 values).
The local program ownership guard rejects forged/spread/deserialized objects;
a future transport adapter must explicitly reconstruct and validate its program.

The whole-dab function reuses common sourceAutoGeometry under its existing
profile name, then one scalar/NEON coverage body. Geometry consumes stored scale
and normalized angle; coverage consumes raw angle sum, shape.scaleX/Y and center
hotspot−.5+subpixel. Squared ellipse norm is used, not Gaussian sqrt/erf. Native
scalar interpolation uses binary64 FMA and U8 transparency truncation. NEON
narrows gathered table values toF32, evaluates the F32/FMA interpolation and
passes normalized transparency through the source pigment conversion: RNE for
four-lane prefix, truncation for the tail. Per-pixel excluded-lane evaluation is
value-equivalent for the closed finite domain, not a claim about exception flags
or the original all-lane control flow. Math.sin/cos identity is proven for the
retained inputs, not for every binary64 angle.

Independent oracle: original installed KisCubicCurve point-list constructor,
SparseLU, floatTransfer, curve mask generator/setScale, common whole-auto wrapper,
scalar and NEON mask bodies and original pigment converter under Unicorn FPCR0.
The explicit factory interface chooses an owned applicator; GUI factory selection
and physical device dispatch are not attested. Only ordinary bounded allocation,
memory, string and owned color/device interfaces are hooked. Curve, solver, table,
polynomial, QString::number formatting and mask math are original machine code.
The libc++ VTT is resolved from actual installed ELF symbol/ABS64 authority.
Native point order, coefficients, full tables and rational spline residual checks
are retained in the table fixture/proof. Residual checks are NOT injected success
flags or tolerance for output comparisons.

All40 original whole-wrapper cases match all40,864 A8 bytes exactly, including
20 native NEON branches, anisotropic tips, nonzero first knots, rotations and
subpixel placements. Original600px curve resolution2400/table2402 remains intact;
mask geometry in this corpus is explicitly resized to a64px base window. The
fixture does not claim full saved600×600 coverage. Five curves cover all10 stock
soft-circle roles, while integrating those stock descriptors is a separate step.

Closed domain: circle/spikes2, softness1, randomness0, density1, AAoff (all10 actual
stock roles meet it). AA/nonunit softness need separate independent gates. Fresh
caller-owned output, maximum1MiB A8,4096 per side and16M sample budget; all geometry,
finite-intermediate and caller reservation checks precede A8 allocation. No cache,
GPU lifecycle or cancellation API is added; future incremental execution must reuse
this arithmetic body. Native/tool/source identities are in fixtures/sourceSoftCircle.

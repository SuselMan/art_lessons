# Explicit installed ARM sensor transfer

Source-informed by Krita GPL-2.0-or-later at
bd6e8d061d2f0388c5b10278786cf0fe62e3135f, KisCubicCurve/Spline and original
installed ARM64 image. No clean-room claim or new point-solver implementation.

The existing SINGLE sourceCurveTransfer evaluator now accepts an explicit sensor
layout with installed-arm64-fused-v1 arithmetic. It uses256 values, original
index*(1/255) grid, endpoint clamp and right-interval selection, separate x²/x³/
b*x², two binary64 fused multiply-adds, separate final+d and final0..1 clamp.
The original default host/separate law and explicit soft-mask R+2 law retain
unchanged behavior. SourceOptionProgram accepts this explicit arithmetic choice
per curve; omission keeps the old path. Unknown arithmetic is rejected, including
for identity curves. No source descriptor/compiler profile is promoted by this.

Independent fixture sourceCurveSensorFused.native.json contains15 actual Gaussian
sensor constructors and3840 table values captured by executing original
floatTransfer256/updateTransfer/Data::value ARM64 instructions with ordinary ABI
allocation hooks, FPCR0 and no table/coefficient/math hooks. Tool, input, original
seven library hashes and instruction evidence are embedded. Original code was
fetched from Samsung into RAM for bounded emulation; this is not original GUI
painting or a hardware-latency proof. Every F64 result matches by Object.is;
the unchanged separate law differs948/3840, so exact coefficients alone do not
justify migrating a sensor program to the new profile.

sourceCurveIdentityFused.native.json separately captures original isIdentity on
six boundary cases: exact endpoints, adjacent F64 values around qFuzzyCompare,
corner flags, endpoint-nextafter and constantzero. The near-identity accepted case
has254/256 nonidentity table values. Thus identity is the native predicate and
must bypass table evaluation independently. The existing option compiler retains
that bypass and does not ask for coefficients for identity curves.

Receipts: fixes-v52/gaussian13-native256-law-check.json,
curve-identity256-boundary-check.json, curve-binding52-transfer-static-proof.json,
fused-sensor-program-tests.log and fused-sensor-web-tsc.log. Native probes are
separate immutable runners; previous coefficient-only captures are unchanged.
No author/material/wire/editor activation or whole-stroke compatibility is claimed.

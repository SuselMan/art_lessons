# Portable float32 Over: explicit approximation boundary

This fixture is 512 actual calls of the unchanged `compositeOnePixelScalar`
from pinned Krita `bd6e8d061d2f0388c5b10278786cf0fe62e3135f`, together with
unchanged `OptiRound::roundScalar` and `OptiDiv::divScalar`. Sources and SHA256
are in `source-lock.json`. `scalar-driver.cpp` provides data/Qt traits only.
`assemble.py --source-dir <pinned-source-directory> --output <temporary.cpp>`
reads those independently retrieved pinned files. It preserves upstream
SPDX headers in generated source. Build with existing g++:
`-std=c++17 -O2 -fno-fast-math -ffp-contract=off` on x86 SSE.
The generated executable is not retained.

This is NOT a receipt of the Android installed binary, active factory dispatch,
SIMD packets, FMA, NEON, profile conversion, or the complete paint pipeline.
Native bodies retain LGPL-2.1-or-later (`KoStreamedMath.h`) and LGPL-2.0-or-later
(`KoOptimizedCompositeOpOver32.h`); see their pinned SPDX headers. The ARM32
rounding branch also contains upstream MIT sse2neon notice. No upstream native
implementation text is copied into the production TypeScript kernel.

The separate portable kernel is an authored float32 model using exact IEEE
single-precision division and nearest-even byte stores. It exactly matches510
of512 SSE scalar receipts and alpha for all512. Cases213/253 differ by1 RGB
because native scalar SSE uses hardware reciprocal estimate. These residuals
are explicitly asserted, not fitted or dismissed as native identity. The
integer fallback remains a separate model and existing rendering is unchanged.

Mask application at material storage and a composite mask are different:
source alpha128 with mask1 stores alpha1; painting that with opacity.99 keeps1.
Passing mask1 only to the float composite gives alpha0. The helper assumes the
caller has already performed every required material storage stage.

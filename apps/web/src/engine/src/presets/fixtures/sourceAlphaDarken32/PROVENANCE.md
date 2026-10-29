# Explicit optimized32 scalar AlphaDarken profile

Profile: `optimized32-scalar-f32-rne-v1`, explicit creamy/hard policy. This is
not the generic integer fallback, optimized SIMD packets, active Krita factory,
installed Android dispatch, color management or the complete brush pipeline.

`scalar.native.json` retains1,280 independent native scalar calls and54 ordered
24-step overlaps (2,576 actual pixels total). Overlaps independently vary
constant/falling/rising opacity, flow0/.4/1, initial destination alpha0/128/255
and creamy/hard wrappers, with alternating colors, source alpha0/1/64/128/254/255,
absent/additional selection masks. Each record includes source, actual prior
destination, authoritative raw controls, actual F32 wrapper values and output.
Raw opacity/average/flow are narrowed at ParameterInfo's float boundary. Here
`averageOpacity` is the effective value selected by the caller for *lastOpacity;
the fixture deliberately does NOT invent or apply the separate qFuzzyCompare
pointer-alias normalization. Overlap averages come from the actual qreal method
below, then the driver explicitly supplies that chosen value to the wrapper.

The oracle compiles the UNCHANGED pinned `compositeOnePixelScalar` from
`KoOptimizedCompositeOpAlphaDarken32.h`, unchanged creamy/hard wrapper structs,
actual `KoStreamedMath` mixed-byte lerp and `OptiRound::roundScalar`, actual
`Arithmetic::lerp` and `KoColorSpaceMaths<float>::blend`. Type/class declarations
and IO substitute unavailable application/Qt dependencies. Native function
bodies are not ported/reimplemented by the oracle. Pin:
`bd6e8d061d2f0388c5b10278786cf0fe62e3135f`. All five cached source files were
independently checked byte-for-byte by SHA256 against their official pinned URLs
in `source-lock.json`. Source math, source byte order and branching are retained.

The CPU helper is source-informed authored TypeScript, not a clean-room claim.
It uses explicit Float32 intermediate stores and the existing nearest-even scalar
primitive. Native scalar division here is ORDINARY float division; it never calls
OptiDiv/hardware reciprocal estimates, so there is no image-fit reciprocal table.
Mask-present computes `(float(mask)*F32(1/65025))*sourceAlpha` in native order;
mask-absent computes `sourceAlpha*F32(1/255)`. A selection byte is distinct from
coverage already stored in source alpha. RGB and alpha use different laws. A
transparent destination copies source RGB even at zero effective contribution;
the native SIMD body has other packet shortcuts, which this profile does not
claim to reproduce. Do not silently replace scalar behavior with vector code.

Native SSE round follows MXCSR nearest-even, reset/read as0x1f80 by the driver;
compiler uses separate arithmetic/no contraction. ARM64's source round branch
is a separate execution gate, and ordinary fallback std::lroundf uses different
ties. No FMA/flush-to-zero/device auto-selection/ARM identity is asserted. The
explicit scalar CPU helper matches every2,576 native outputs exactly; unlike the
portable Over profile, this scalar alpha path has no RCP approximation residual.

## Ordered qreal opacity average (separate owner)

`opacity-average.native.json` contains640 actual calls of the UNCHANGED qualified
`KisPainter::blendAverageOpacity(qreal,qreal)` method from pinned kis_painter.cc,
with qreal=double and its native `const float exponent=0.1`. It includes repeated
[1,.2,.4,0,...],512-step falling decay, equal/rising values and F32 threshold inputs.
Every step retains old average, input opacity, output double and narrowed float.
Seven cases differ even after Float32 narrowing from the old .1/.9 DOUBLE-law.
Example: old average.313810590374715, opacity0 → native.28242953086962924,
F32.2824295163154602; old double exponents produce.28242953133724347,
F32.2824295461177826. Root owns the existing brushWash update/alias integration;
this fixture has one producer and is imported there rather than copied.

Reproduce both fixture modes with one small registered compiler resource:

```
python3 assemble.py --repo <worktree> --output <registered>/oracle.cpp
g++ -std=c++17 -O2 -fno-fast-math -ffp-contract=off <registered>/oracle.cpp -o <registered>/oracle
<registered>/oracle > scalar.native.json
<registered>/oracle --average > opacity-average.native.json
```

`native-proof.json` and `opacity-average-proof.json` retain compiler/input/body/
generator/fixture hashes and exact scope. Generated source preserves all upstream
SPDX notices. AlphaDarken32 is LGPL-2.0-or-later; KoStreamedMath/KoColorSpaceMaths
are LGPL-2.1-or-later; wrappers and painter method are GPL-2.0-or-later. The source
round header additionally retains upstream MIT sse2neon notice. Verbatim source
bodies occur only in the disposable generated oracle, not the production helper.
No SDK, Qt runtime, dependencies or original source/header copies are retained in
the Git fixture directory. No renderer, wire or compositor policy is activated.

## ParameterInfo float boundary and alias

`param-info.native.json` retains794 actual unchanged ParameterInfo setter calls
and Qt5.15.7 `qFuzzyCompare(float,float)` (including unchanged qAbs/qMin).
The driver narrows raw qreal inputs BEFORE calling the float setter and records
the actual selected pointer and output bits. Equal/zero/subnormal/neighbor and
F64 threshold inputs cover the float subtract, float product and MIN-relative
comparison.40 cases reject comparing raw doubles first;5 reject substituting a
max-relative epsilon. Signed zero is retained through raw JSON.parse in tests,
since bundler JSON module optimization may erase its sign.

Reproduce with the SAME compiler command above, then `oracle --param-info`.
`param-info-proof.json` pins unchanged method/function bodies, official inputs
and generator; both preexisting output fixtures remain byte-identical after this
producer extension. Qt qglobal retains its LGPL/GPL/commercial license notice;
KoCompositeOp.cpp retains LGPL-2.1-or-later. Production helper is source-informed
authored TypeScript, not a clean-room claim. It rejects nonfinite/out-of-unit
inputs, performs only F32 normalization/alias selection, preserves independent
flow, and does not update opacity history or choose a composite profile.

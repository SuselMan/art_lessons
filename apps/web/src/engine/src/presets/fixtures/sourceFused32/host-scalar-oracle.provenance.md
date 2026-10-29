# Host scalar fused diagnostic oracle

`host-scalar-oracle.cpp` is an authored source-informed arithmetic reference for the mapped installed scalar graph. It is not an unchanged native function body, a clean-room claim, a product backend, or native GUI/SIMD packet identity. Every fusion is explicit `std::fma(float,float,float)` at the individually audited installed FMADD sites. Other operations retain binary32 boundaries, contraction/fast-math disabled; FE_TONEAREST controls FRINTI-style RNE byte packing with low8 wrap. FRECPE uses the existing integer bin algorithm, never an expected-output table. Signed zero, subnormal controls, effective average aliasing and hard flow folding remain explicit.

Sources pinned to Krita bd6e8d061d2f0388c5b10278786cf0fe62e3135f; hashes and mapped installed library identity retained in adjacent proof and existing installed graph fixtures. Referenced upstream notices:

- KoOptimizedCompositeOpOver32.h / KoOptimizedCompositeOpAlphaDarken32.h: SPDX-License-Identifier: LGPL-2.0-or-later. SPDX-FileCopyrightText: 2006 Cyrille Berger; 2011 Silvio Heinrich; 2022 L. E. Segovia.
- KoAlphaDarkenParamsWrapper.h: SPDX-License-Identifier: GPL-2.0-or-later. SPDX-FileCopyrightText: 2019 Dmitry Kazakov.

These are provenance notices, not a claim that source-informed work is independently cleared for permissive reuse. No upstream function body is embedded verbatim in this runner. FRECPE arithmetic follows the already independently ISA-validated project primitive and its Arm-source provenance. Native expected RGBA outputs come from original installed machine-code execution under gated Unicorn, not from this host implementation.

Build using an existing host compiler in ONE registered temporary directory:

```
g++ -std=c++17 -O2 -ffp-contract=off -fno-fast-math -frounding-math host-scalar-oracle.cpp -o "$BUILD/oracle"
```

All fields are little-endian, binary host protocol only (not wire/API). Mode1: u32 mode=1/count, then count records: i32 operator(0Over/1Creamy/2Hard), i32 mask(-1absent/0..255), i32 aliasRawQreal, f64 opacity/average/flow, sourceRGBA8/destinationRGBA8. Output count RGBA8. With aliasRawQreal=false, input controls are already effective, as returned by shared sourcePrimaryComposition; hard folding still occurs once. Mode3 accepts raw qreal control triples and returns three effective F32 bit patterns for native alias tests.

Mode2: i32 mode=2/width/height/wash, f64 outerOpacity, initial planeRGBA8, u32 commandCount. Draw command: i32 kind=1/operator/x/y/maskWidth/maskHeight/mirrorX/mirrorY, f64 effectiveOpacity/average/flow, RGB8, A8 mask. Frame fence: i32 kind=2. Output each fence's u32 localFNV/visibleFNV then final visibleRGBA8. Pixel storage is bottom-up; world placement/top-down masks are transformed once by the common recipe. C++ does not recompute author RNG, material, history or image sampling. TS retains the existing source PNG pyramid/affine/A8 material and sourcePrimaryComposition implementations. One process per stroke, not one process per pixel.

Bounds: plane2048², mask4096², at most100000commands/200M mask samples, point mode1M records. Trusted generator additionally caps recipe input64MiB before copying and validates canonical definitions using common preflight. This trusted offline protocol is not a network parser.

Independent validation:18954 scalar prefix/tail pixel results from2688 baseline buffers,72 discriminating witnesses,137 alpha boundaries,400 tiny cases,8 wholeOver overshoots exact.16512 vector pixels explicitly excluded. Prefix/tail scope uses recorded buffer/residue/source partition law; it is not proof of GUI paintdevice partition. Every col1 case is unambiguously scalar. Actual store-PC audit separately retains unclassified unrolled scalar PCs; no blanket per-PC classification is claimed.794 native ParameterInfo controls exact;73 zero input signs recovered from preserved native bit fields because JSON numeric0 erased them. Twelve overlapping clipped/mirrored wash/buildup frames also matched independent BigInt point-reference FNV/finalRGBA.

Full17 expected generation:17.4s host/RSS204MB, native compositing1.36s;3256draws/203frames. Actual Samsung executor using explicit installed-arm64-scalar-fused-fpcr0-v1 profile matched every finalRGBA and frameFNV, GL0, state/cache/cleanup checks passed. Instrumented correctness timings are not UI responsiveness/FPS. Compact proof retained in `host-scalar-native-proof.json`; private reproducible recipe/runner evidence remains fixes-v52. Temporary binary/config are intentionally excluded from Git and removed through the resource registry after handoff.

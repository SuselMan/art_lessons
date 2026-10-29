# Explicit scalar Over32 shader

`SOURCE_OVER32_SCALAR_GLSL` exports `sourceCompositeOver32Scalar(source,
destination, controlValues, controlSelection)`, with integer-valued straight
RGBA8 pixels. Flat `controlValues=(opacity,selectionMaskByte)` and
`controlSelection=(profile,hasMask)`. Profile0 means
`portable-f32-division-rne-v1`; profile1 means
`optimized32-neon64-scalar-frecpe-rne-v1`. No struct carries fractional controls.
Inputs must satisfy the existing CPU evaluator's validation; renderer must set
highp float and require HIGH_FLOAT precision>=23. Unrecognized profile/controls
are rejected by the host, not silently admitted by the shader's numeric branches.

The shader is source-informed authored GLSL for the single CPU point evaluator
in sourceOver32Scalar.ts. Pinned source and unchanged scalar oracle are in
presets/fixtures/sourceOverPortable; native ARM OptiDiv uses one FRECPE followed
by F32 multiply, without a Newton step. NEON64 round uses the selected FPCR0
nearest-even law. This is not vector packet composition, active factory dispatch,
color management, premultiplied storage or full brush compatibility.

## Closed reciprocal domain

Only destination alpha1..254 enters the reciprocal branch. Its updated F32 value
is positive and lies in[1,256). The upper bound must NOT be called255: native
sourceA255, destinationA1, opacity1 yields255.00001525878906 because source's
Float32 reciprocal255 rounds upward. Seven exact power2 halvings normalize to
[1,2). Multiplication by256 is exact; floor selects bin256..511. The source ARM
instruction's integer estimate is
`floor((floor(524288/(2*bin+1))+1)/2)`, multiplied by exact power2 `2^(-9-e)`.
No log2/exp2, bit operators, estimate texture/table, hardware reciprocal or
refinement occurs. This PRIVATE helper cannot be called with arbitrary ARM input
classes/subnormals; it is valid only inside the closed scalar Over branch.

Every denominator is odd513..1023 and cannot divide524288. The exact quotient's
distance from either integer is at least1/1023, while nearest-F32 division error
is at most2^-15 in this range. Therefore the floor is robust under the specified
F32 arithmetic graph. All other integer intermediates are <=524288 and exact;
the final estimate times power2 is representable without rounding loss.

Private reproducible proof: fixes-v52/over-shader-domain-proof.cjs/.json. It
compares the shader arithmetic graph with sourceArmFrecpe (independently matched
to155636 actual Samsung ISA records), not another shader string. All274432 calls
match bit-for-bit:12288 exhaustive bin endpoint/interior/adjacent checks across
all8 exponents, plus262144 deterministic random binary32 inputs. Ordered input/
output SHA256:385fb427b93c81e09b30b72d1d9061474e5b21f556ba7fe6d5b40597caa397d9.
This mathematical/CPU proof is NOT GPU execution or actual ARM compositing.

## Device gate

Named highp intermediates express separate F32 operations; GLSL ES1 does not
promise correctly rounded division, absence of contraction, or identical driver
lowering. Both profiles still require actual-device whole-point conformance,
using existing2048 host-semantic ARM native fixtures and old512 SSE/portable
controls. The portable profile uses ordinary division and retains its previously
recorded two SSE reciprocal residuals; it must not inherit NEON estimates.
Byte output should be stored once using the host's validated normalized RGBA8
store. Source alpha already contains material coverage; optional mask is an
ADDITIONAL composite selection and must not be passed twice.

No renderer, prepass, session, wire or policy is activated by this declaration.

Initial candidate GLSL string SHA256:
`e2963ec23ab7b1d5d6ea0c8f3ac702ea4de307940b875155a0d415dd6214ed5d`.

## Samsung WebGL1 conformance

Actual Samsung SM-T970 / Adreno650, WebGL1 highp23: 18944 whole-pixel
cases exact, maxdelta0, GL errors empty. This includes2048 unchanged native
ARM-body HOST SEMANTIC cases,512 old portable CPU regression outputs (including
the documented two differences from SSE reciprocal),8192 deterministic stress
cases per scalar profile. Native host semantics are not actual ARM whole-
composite execution. This device proof does not claim native SIMD/factory
dispatch, cross-vendor identity, active layer storage or a whole stroke.

Reproduction: private fixes-v52/run-over32-scalar.mts and over32-scalar-body.js.
Receipt: over32-scalar-device-result.json, prepared hashes in
over32-scalar-prepared.json; GLSL SHA above unchanged. All own contexts and
child tabs are disposed in finally; original report tab is restored.

## Installed build arithmetic limitation

Read-only static inspection of Samsung's installed Krita5.3.4.1
libkritapigment ARM64 (SHA256
230ccf905226f4324ffdf8c7239e8be90f0506cfadda25393d1ba014ab0bb783)
identified Over32, creamy32 and hard32 via RTTI/relative-relocation/vtable
links and verified FDE function bounds. Their composite entrypoints and
direct callees contain actual FMADD/FMLA instructions (hard also FMSUB).
Thus a separately rounded scalar/noFMA profile cannot claim this installed
build's arithmetic identity. Active GUI factory choice, actual branch execution,
paint-device partition and FPCR remain separate unproven gates.

Private receipts: fixes-v52/installed-compositor-fma-receipt.json and
installed-compositor-disassembly.json; reproducible read-only reader
inspect-installed-compositors.py. No APK/library was retained or app launched;
temporary disassembler wheel was removed by the registered cleanup guard.
Existing device conformance above remains evidence for the explicit scalar
profile only; the observed installed FMA graph requires its own implementation
and validation.

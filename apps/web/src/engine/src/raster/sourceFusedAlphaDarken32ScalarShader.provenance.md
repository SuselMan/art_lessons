# Named fused scalar AlphaDarken diagnostic profiles

`sourceCompositeFusedAlphaDarken32Scalar` implements the installed **scalar point** graphs for creamy/hard AlphaDarken. It does not infer native vector packets, all-lane branches, tile64, paint-device layout, factory selection or active GUI dispatch. It adds no renderer, material, wire, room or descriptor activation. The existing scalar/noFMA declarations are unchanged.

`prepareSourceFusedAlphaDarken32ScalarControls(variant,input,selectionByte?)` is a local upload adapter. It invokes the common native ParameterInfo F32 narrowing/Qt-average-alias helper FIRST. Hard then computes `f(flow*opacity)` and `f(flow*effectiveAverage)` ONCE on the CPU, exactly like native per-call preparation. Shader O/A are already folded and must not be multiplied by flow again. Flat values carry `(effectiveO,effectiveA,F,selectionByte)` and flags `(hard,hasSelection)`; F32 components of O/A/F preserve classification through numeric GPU flushing. The raw qreal running average/history update is not performed here. Absent selection differs from selected byte0.

## Reused arithmetic and actual graph

The shader reuses the exact finite FMA component primitive and the normal-domain numeric wrapper. RGB is fused `S*(sourceRGB-destinationRGB)+destinationRGB`. For A>O and A>D, full alpha uses separately rounded FDIV `f(D/A)`, separately rounded `f(A-S)`, then their fused product plus S. Otherwise O>D uses fused `f(O-D)*M+D`. Hard zero alpha uses fused `f(D+S)-D*S`; creamy zero is D. Flow blends use the installed FMA sites and bypass flow multiplication if F==1. RNE byte packing retains low8 bits explicitly. No blanket all-lerp-FMA substitution is used.

The scalar FDIV remains the native graph's ordinary numeric division. Actual GPU cases pass exactly, including targeted alpha-boundary controls; this receipt does not prove every finite quotient is correctly rounded on every GPU. It is not replaced with the vector profile's FRECPE/refinement graph.

## Proven tiny domains

General numeric subnormal preservation FAILED on the tested GPU, as retained in the preceding Over unit. Classification therefore uses captured components, not a subnormal numeric comparison. Both partitions below are exact power-of-two domain splits, not output tolerances.

For effective O<2^-100, S<=O because the scalar M is in[0,1]. RGB changes for D>0 are smaller than255*2^-100 and round back to original integer RGB. D0 unconditionally copies sourceRGB even if sourceA0/selection0/S0: this AlphaDarken rule differs from Over's early S0 return. Native D0 full alpha is S (or0), so final alpha rounds0. For D>0, O<D. The only nontrivial full-alpha branch has A>D: subtraction A-S rounds to A, since A>D>=f(1/255)>2^-8. Correct F32 FDIV/fused arithmetic places full within a conservative2^-22 of D; the subsequent flow FMA stays within2^-21 of D, including its last rounding. The normalization and final multiply contribute less than2^-14 byte error. Thus total distance from the original alpha integer is below2^-11, strictly less than the half-byte rounding boundary, so destinationA is exactly preserved. Hard zero is likewise D after adding/subtracting this tiny S. Thus the tiny-O branch returns destination for D>0, or sourceRGB/A0 for D0.

For creamy F<2^-100, opacity-driven RGB must still run. The normalized full/zero alpha range is bounded near[0,1], and |F*(full-D)|<2^-98, far smaller than half an F32 ulp at nonzero D>=f(1/255). Hence resulting alpha is the original destination byte. D0 also rounds alpha0. The shader freezes **only alpha**, after computing RGB. Hard tiny flow is already handled through the exact CPU-folded effective O.

## Ordinary finite domain and terminal underflow

The exhaustive65536 sourceA/selection coefficient table confirms native scalar M in[0,1] with every nonzero value at least2^-16 (recorded as IEEE F32 math, not a GPU execution oracle). For O>=2^-100 this gives S>=2^-116 whenever nonzero. For the A>O branch, **A>O>=2^-100**, not an arbitrary relationship between A and S, gives a normal nonzero A-S quantum at least2^-123 (M<=1). With D>0, D/A>=D>2^-8; numeric FDIV operands/result are normal. Differences near nonzero normalized destination alpha have normal F32 quanta (at least2^-32 conservatively). Hard's D*S is at least2^-124 when nonzero. FMA's internal exact product may be smaller; the component primitive preserves it until the one final rounding. Its normal input decomposition does not expose that product to numeric FZ.

RGB cancellation with nonzero integer destination requires S>=1/255>2^-8; otherwise output is positive or the untouched integer. Thus nonzero RGB results are normal (the exact cancellation quantum is at least2^-31). If destinationRGB0, nonzero output is at least2^-116.

Only creamy D0 terminal `F*S` can yield a subnormal result on the ordinary path. No subsequent branch or RGB value depends on that result. Every such magnitude multiplied by255 remains far below half a byte, so either exact subnormal reconstruction or hardware flushing yields the same canonical alpha byte0. This is a terminal-byte equivalence argument, not general subnormal bit preservation. Nonfinite classes are unreachable for these validated unit controls and bounded operands.

## Independent evidence and limits

`tiny.native.json` contains200 input-only controls plus destination bytes observed from original installed ARM64 kernel emulation, FPCR0, with no arithmetic hooks and equal direct/wrapper results. It covers both variants, zero/tiny/normal flow, normal×normal→subnormal hard folding, zero selection/sourceA, aliases and D0 hidden RGB. It is not physical CPU/GUI execution. Unit tests check those independent bytes, the before-fold alias, one-time folding and creamy tiny-flow RGB preservation.

Actual Samsung Adreno650/WebGL1 passes599 scalar point cases (256 baseline,48 fused witnesses,95 alpha-boundary controls,200 independent tiny cases) bit-exact RGBA, GL errors0. The final primitive and input/library/runner hashes are in `proof.native.json`. Complete fragment size9419 bytes; initial cold compile4.9656s, later cached compile1.14–1.42s. A warmed uniform-input overwrite workload with ordinary creamy O/A/F and the average FDIV branch reported about0.1–0.2ms for32768 logical pixels and exact corner readback. Uniform/overdraw optimization and coarse timing preclude a shaded-pixel throughput or responsiveness claim. No activation follows this diagnostic pass.

All own child tabs, contexts, GL objects and forwarding were removed; the original three tabs and foreground parent3631 were preserved. No new runtime, SDK or dependency was created. Private producers/complete receipts remain in `temp/device-runs/krita-stroke-20261024/fixes-v52`.

## RGB identity hoist — bounded old/new GPU proof

The caller now checks two exact byte identities BEFORE coefficient decomposition:
S==1 returns source RGB; all three equal source/destination byte channels return
that RGB. Destination alpha0 remains the first native hidden-RGB shortcut, even
with S0. Computing S, its operation order, hard preparation, tiny domains, full
alpha/zero/flow graphs and low8 packing are unchanged. This is branch-only reuse
of the same scalar profile, not relaxed precision or a new native dispatch claim.

For S1, source-destination and the exact sum are integers in[-255,255] and[0,255],
respectively. FMA(1,source-destination,destination) is EXACT source byte, so its
F32 store, RNE and low8 pack are identical. For equal byte channels the difference
is zero and FMA(S,0,destination) is that destination byte for every finite S in
this profile, including signed zero. Alpha is intentionally not inferred from
these RGB identities. Equality hoist avoids the currently redundant coefficient
normalization before three internal per-channel equality returns.

Host tests retain original ISA FMADD/FRINTI endpoint receipts, check every65536
source/destination byte pair for S1 against the independently validated exact
F32 FMA primitive, and8192 deterministic normal/subnormal/zero/unit equal-byte
coefficients. Existing native tiny/full-Alpha fixtures remain tested. These
establish arithmetic preconditions; they do NOT execute GLSL or substitute for
the separate actual-Samsung gate below. The preceding599-case GPU receipt describes
its frozen older source, not this hoist. No state, resource, shader family,
compositor selection, room, renderer or author activation is added.

### Actual old/new gate

Root's physical Samsung gate passed14 trials ×512 points =7168 points PER mode,
old and new independently compared with host CPU fused-scalar source-law expected.
Both modes wrong0/maxDelta0; state/samplers/leases restored, hot uploads0, GL0 and
GPU/CPU cleanup0. Cases combine creamy/hard, equalRGB/unitS/mixed RGB and normal,
tiny and selection controls. Despite a reused runner label, this was AlphaDarken,
NOT Over or a complete native GUI operation. It does not prove a speedup.

Old module came RAM-only from `git show d8410945445de9521643c2f17a34541f7fe811a0`,
source SHA256 `5786b5098ff7dbefbf0bfaf271e3173d19feebe11f49a3661123010e5248acd3`.
New source SHA256 `3fc590497d7b4b9db800c12a941e650dc9b50a19323a2da889d437c9e87710b1`.
Receipt `R52/alpha-rgb-hoist-device-result.json` SHA256
`2e0dc3a2a0c0a4d433476ef2b4710b3df4b3fbbd38d703d0930a520c812ab81c`;
body `85f125c5d735bb1123e1802f2f703095dd44993cfefb39976d79fd459b4a2caf`,
config `e3439a38e6f72d287319d0c12858f8054f73a815c8a0dc2f69393920afe1d850`.
Complete runner/body/cleanup retained privately next to the receipt. Root-owned
child/context/GLobjects/forward were closed; no new service/dependency/runtime.
Host14tests/3files, common actual web TSC49153 and scoped lint pass. Earlier599
point proof remains associated with its older frozen source; this receipt adds
only the exact hoist scope described here. Whole auto7 production-service proof
and responsiveness measurements remain separate root-owned gates.

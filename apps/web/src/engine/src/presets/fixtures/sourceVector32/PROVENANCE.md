# Four-lane no-FMA diagnostic baseline

`compositeSourceVector32` is one bounded whole-buffer executor for Over and creamy/
hard AlphaDarken. Explicit profile `optimized32-neon64-vector4-no-fma-v1` is NOT
installed Krita identity: pinned source permits `-ffp-contract=fast`; root's exact
installed library reachable-kernel disassembly also confirms FMADD/FMLA/FMSUB.
No profile/catalog/renderer/session/wire admission is changed here.

Krita pin bd6e8d061d2f0388c5b10278786cf0fe62e3135f. `assemble.py` extracts unchanged
KoStreamedMath genericComposite, both scalar/vector compositors, OptiDiv and
OptiRound, creamy/hard wrappers, ParameterInfo setter, Qt5.15.7 qFuzzyCompare/
qAbs/qMin, native scalar Arithmetic::lerp/float blend. `source-lock.json` pins each
input. Official upstream source paths/URLs are retained in the adjacent
sourceOverPortable/sourceAlphaDarken32 locks. Extracted bodies exist ONLY in the
small disposable oracle; original SPDX/copyright notices remain in generated CPP.
KoStreamedMath/Over/arithmetic/params are LGPL-2.1-or-later; AlphaDarken32 is
LGPL-2.0-or-later; wrappers GPL-2.0-or-later; Qt retains LGPL/GPL/commercial terms.
The production TypeScript is source-informed authored code, not clean-room.

Authored shims substitute declarations, four-lane typed operations/IO and ARM
instruction VALUE semantics. No xsimd SDK or Qt/runtime is copied or installed.
ARM round/pack models NaN->0 and saturation to S32 before native bit packing;
+Inf therefore produces byte255, -Inf produces0. IO normalizes the native BGR
lane naming to the existing Rgba8 DTO without changing point arithmetic.
Prefix/tail reuse existing scalar CPU helpers; vector uses a different graph.
FENV flags, traps, NaN payload propagation and actual compiler lowering are outside
this value profile. Eager inactive vector operations may set exceptions in native;
the pure evaluator does not claim exception-state identity.

`whole-buffer.native.json`:2688 HOST semantic buffers,896 each operator. Widths
1,3,4,5,8,9,13; two rows with stride4*cols+4; destination residues0/4/8/12,
source initial residues0/4, including all16 source/destination residue pairs after
row progression; constant/nonconstant source; mask pointer absent/present; empty/
opaque/mixed/random destination alpha; controls0/.324/.5/1, flow0/.4/1 and
falling/rising effective average. Additional mixed zero lanes and min-F32-opacity
cases exercise NaN/Inf pack paths. Original input/padding/output and actual scalar/
vector callback counts are retained. No branch/partition trace is invented from
the expected TS implementation. `native-proof.json` pins generated CPP/producer/
fixture SHA and actual call counts; all buffers match byte-for-byte.

## FRECPS proof boundary

Over uses one existing ISA-proved FRECPE and F32 multiply, no refinement.
Cached xsimd13.2 candidate's float batch division (used by vector AlphaDarken)
uses FRECPE, F32(FRECPS(denominator,r)*r) twice, then numerator multiply. Its
version is NOT proven to be the installed dependency; installed disassembly
independently confirms FRECPS exists, but fused operand mapping is separate.

`sourceVector32ReciprocalStep` accepts binary32 finite positive denominator and
an estimate/refinement with finite product in[.5,2], or +/-Inf. On this CLOSED
domain F32(2 - double(denominator)*double(estimate)) models fused FRECPS: a product
of two24-bit significands has<=48 significant bits; alignment with2 and subtraction
in this near-one range uses<=50bits, within double's53. Thus double evaluates the
exact real difference before the one F32 rounding. Infinite cases propagate their
sign. General arbitrary operands, NaN payloads, exception flags and all FPCR modes
are not admitted. Separate native F32 multiplication follows each step. Final
reciprocal overflow and zero-numerator/Inf NaN stores remain observable.

Independent ACTUAL Samsung FPCR0 capture, not generated expectations:
`fixes-v49/frecpe-receipt/capture.bin`, SHA
cdfe52191e0e104297f13337adedc6fbab742149004ec1f18e30ad77047a2862.
147405 positive-finite-denominator records (including13 infinite estimates) have
ZERO FRECPS or refined-multiply bit differences.1126 compact authoritative input/
estimate/step/product U32 records are retained in reciprocal-step.native.json.
`capture-step.py --capture <originalcapture.bin> --output <fixture>` reproduces
the compact selection byte-for-byte, requiring the exact full capture SHA.
The second step follows the same proven closed graph; whole-buffer expected data
is HOST semantic execution, not a second actual ARM compositing capture.

## Bounds and canonical placement boundary

Admission precedes output allocation and work: cols/rows1..4096, <=1048576 paint
pixels, each pixel/mask buffer<=4194304bytes, safe integer byte spans, sufficient
source/destination/mask lengths, pixel-aligned source/destination stride/residue.
Source stride0 means constant single pixel. Mask stride0 repeats its row;
destination stride0 and source row alias feedback are not native modes admitted
by this snapshot API. Output clones destination and preserves row padding, never
mutating inputs. Logical pointer residues are explicit and deterministic; they
are NOT proof of native paint-device row allocation/clip equivalence. Operation
segmentation and four-pixel neighbors must remain fixed for replay. No network
physical pointer or automatic device/profile selection is proposed.

Reproduce with ONE registered small compiler resource:

```
python3 assemble.py --repo <worktree> --output <registered>/oracle.cpp
g++ -std=c++17 -O2 -fno-fast-math -ffp-contract=off <registered>/oracle.cpp -o <registered>/oracle
<registered>/oracle > whole-buffer.native.json
```

This is a completed no-FMA diagnostic baseline. Next installed-profile work needs
actual FMA operand/dataflow mapping and independent correctly-rounded fused value
primitives; neither the scalar GPU pass nor this baseline proves that contract.

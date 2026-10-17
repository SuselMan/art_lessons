# Integer hydraulic baseline (CPU READY, GPU untested)

`webgpu/macro6-integer-hydraulic.ts` exports `integerHydraulicDefinitions`:
`wgsl-macro-integer-hydraulic`, steps128/256, fixed128 grid, fully mobile.
No registry or old model modified. One u32 compute dispatch jointly updates
four pigment channels and water per local disjoint pair phase; X0,Y0,X1,Y1.
No f32 shader operations, sampling or float output conversion. Output packed
RGBA8 via integer division, nearest coarse reconstruction. This is a NEW
rational model, not byte equivalence with old GL/f32 hydraulic arithmetic.

Coefficients: diffusion25/100; head=W+6paperByte; dt35/100;
permeability=(1275−2maxPaper)/1275. q uses explicit half-up integer division,
then donor4/5 and receiver65535 water limits. Pigment transfer limits receiver
alpha capacity, transfers RGB proportionally with explicit integer division.
Each partner computes the SAME canonically ordered pair and selects its own
result. Thus no races/atomics and exactly paired four-channel/water code sums.

Bounds: head difference<=67065. Maximum q numerator
67065*35*1275+63750=2,992,839,375 <2^32.
Maximum color numerator65535²+32767=4,294,868,992 <2^32.
Pack numerator65535*255+32767 <2^32. Division denominator>=1.
CPU 100000 random valid pairs preserve every channel sum/water, positivity,
premultiplied cone;5000 independent BigInt comparisons match Number oracle.
Types strict/noUnused0; fake-device lifecycle/repeat counts PASS. Five tests.
This is NOT a WGSL compiler or GPU/device determinism test.

Uses existing CPU macro3 reducer with mobile1: all64 fine water bytes must
be positive or coarse cell is blocked. Blocked pairs never exchange; blocked
and unchanged cells return original fine pixels literally. Thus all-dry exact
identity is structural. Nearest reconstruction does not cross blocked cells.
Coarse reduction and final byte rounding do NOT preserve arbitrary fine byte
mass exactly. Report them separately from exact paired coarse-code mass.
Nearest8px grid intentionally remains visible: quality control first, not a
claimed watercolor improvement. No residual/paper weights in reconstruction.
No retained native outputs, services, browser/GPU/device resources created.

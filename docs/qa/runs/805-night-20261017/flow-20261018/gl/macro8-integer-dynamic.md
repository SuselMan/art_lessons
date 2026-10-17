# Integer dynamic wetting: CPU READY, not yet GPU certified

Standalone `webgpu/macro8-integer-dynamic.ts` exports
`integerDynamicDefinitions`, id `wgsl-macro-integer-dynamic`, steps128/256.
No frozen macro6/macro4 or registry modified. Requires1024, coarse128.

Each Cell contains u16-range surface W, absorbed S, mobile premultiplied M4
and adsorbed premultiplied D4 (stored u32). One dispatch updates one disjoint
pair phase X0/Y0/X1/Y1 jointly, then absorbs locally. No shader float/sample,
atomics, evaporation or wall map. Newly wet dry paper is allowed.

Head = W +6*paperByte −floor((absorptionCapacity−S)/4). Directed water
transfer uses dt35/100, permeability(1275−2maxPaper)/1275, donor<=4/5W,
receiver W<=65535. M carried by W with rounded Mα*q/W; incoming pigment is
limited by recipient cap−Mα−Dα. Water can still travel when pigment is held
back by the phenomenological pigment capacity. No strict CFD claim.

Local absorbed water=min(floor(W/32),absorptionCapacity−S), capacity8192+
64paperByte<=24512. Adsorbed alpha first computes rounded Mα*absorbed/W,
THEN multiply70/divide100. Other channels proportional to that alpha.
The same integer amount is subtracted from donor and added to receiver;
local M→D and W→S also use identical amounts. Hence global W+S and every
M+D channel code sum are exact. All mappings preserve the premultiplied cone.
CPU100000 random valid pair states test these invariants and capacity;
constant-paper1D water drop expands into >8 cells with exact global ledgers.

Bounds: head lies in [−6128,67065], difference<=73193;
73193*35*1275+63750<2^32. Every pigment product<=65535² and rounded numerator
<=65535²+32767<2^32. Absorption product<=65535*2047. Deposition multiplication
70 occurs only AFTER division, <=65535*70. All denominators>=1.

Fine initial dry pigment is literal stationary RGBA8. A coarse cell's mobile
wet-pigment mean is quantized to u16; cap=min_fine(65535−257stationaryAlpha).
If this initial mobile alpha does not fit beside dry pigment, ALL original
pigment of that cell remains literal fine stationary, M=0. The cell still
conducts water, and incoming M uses the resulting smaller capacity. This is
an explicit functional restriction, not clipping or material deletion.
Metadata.initial reports initialStationaryAlpha, initialMobileAlpha,
frozenWetAlpha, frozenCellCount, initialWaterCodes, initialMobileCodes.
Large frozenWetAlpha is a negative functional result to report.

Nearest pack adds integer-rounded (M+D)*255/65535 to literal stationary.
The conservative minimum fine free-alpha cap guarantees no byte overflow;
there is NO output clamp. Dry identity is exact. Coarse input averaging and
final byte rounding are separate mass errors; coarse transfer exactness does
not magically certify fine byte mass. Nearest8px blocks remain a quality
limitation. No fine paper redistribution or bilinear yet.

Readback (outside run timing) includes W/S/M/D coarse ledger. CPU mock tests
cover repeat upload/run, fixed dispatch count, double destroy, and partial
bind failure cleanup. Five tests PASS, strict/noUnused TypeScript0. Mock does
not compile WGSL or prove GPU/context-loss behavior. Actual Samsung/Intel
fullRGBA hash pair and zero/initial-dry tests are mandatory next gate.
No device processes, services or temporary builds created by this work.

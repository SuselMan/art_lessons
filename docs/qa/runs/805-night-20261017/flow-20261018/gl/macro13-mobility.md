# Global mobility calibration, not fixture adaptation

New `webgpu/macro13-mobility-calibration.ts` exports `mobilityDefinitions`,
id `wgsl-macro-mobility-calibration`, steps256 gains1/3/6. gain constrained1..8.
Old V10/V11 source unchanged. Uses V9 stable factory and V10 local PACK.

Initial raw water1 maps to16384 u16 surface codes (water capacity4). Thus
V10's K=meanW/65535 is<=.25 even at maximal initial water, and typical captured
raw61 gives only~.06. Synthetic raw180/200 does not calibrate those captures.
The new GLOBAL coefficient uses K=min(meanW*gain,65535)/65535, mixing absolute
factor=min(minW*gain,16384)/16384; gain applies identically to every scene.
No histogram normalization, per-fixture setting, image/geometry cue or hidden
paper adjustment. gain1 is exactly the old CPU V10 numerical model.

CPU paired-code invariants across all8gains/80000random pairs PASS (all4M+D,
W+S, premul and capacity);10000gain1 cases match old CPU reference. Products
meanW*8<=524280; bounded scaledK<=65535 before q multiply, so
q0*scaledK+32767<=65535²+32767<2^32. Mixing multiply<=64*16384.
Uniform-W equal-alpha opposite colors outgoing k (fraction /256):
raw4:1/3/6;raw16:4/12/24;raw35:8/26/52;raw61:15/45/64;
raw128:32/64/64;raw200:50/64/64 for gains1/3/6.

Three tests PASS; strict/noUnused0. Source anchors checked against actual
module. No GPU/WGSL compilation claimed; actual low-water captures plus
synthetic wet/dry ratio, mass and cross-device output are required. Larger
gain can again over-spread low-water strokes or erase contrast: not called a
physical calibration or quality win before images. InitialS0 limitation and
V10 local reconstruction mass qualification remain.
No devices/services/tempbuilds created.

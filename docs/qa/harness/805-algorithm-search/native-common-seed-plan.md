# QA forward material seed (review before runtime/GPU)

CPU helper `native-common-seed.cjs` constructs synthetic native material from exact common optical-density bytes. It does **not** invert a captured brush wash. All six source/destination planes are separate owned arrays. Three CPU tests cover every byte code, asymmetric orientation, RGB>A, dry pigment, pure water and rejection of implicit RGB conversion.

Contract evidence:
- `raster/shaders.ts` around582–587 and1448: P.r/g are deposit-weighted brush water/paper wetness, P.b pigment strength × deposit, P.a deposit. Synthetic convention chooses deposit=C.a and strength1, r=g=round(C.a*W/255).
- `watercolor/puddle/PuddleTarget.ts` around128–134: native reset aligns P.b to min(C.a,P.a); initial water comes from local/foreign solvent. Constructed P.a=P.b=C.a avoids silent mass truncation.
- Coverage is an explicit synthetic silhouette: A255 on water-or-pigment, R128 across coordinate, G0 blot, B=water standing amount. This is an assumption, not recovered brush geometry.
- C native bytes equal common RGBA. A **fixed** scale.5 gives exact roundtrip `round(2*.5*C)=C`, preserving RGB>A and zero-mass depth. Existing automatic converter must not be used as the roundtrip oracle.
- Local solvent A=commonW; no foreign fluid. Paper R=commonheight; world paper sampling must read this exact supplied field. Transparent original backdrop.

Proposed isolated runtime seam (not implemented): `qa-seed-common` once per fresh engine, outside all timers. Create one1024 owned layer/tile and `RibbonStrokeScratch`; upload P/C/coverage/local solvent/original with `restorePixelsRect`, install explicit front8-detail-flow-v4 finish context and neutral paper/context origin. Inject the supplied paper-height texture through the isolated engine context only. Set the controller retained diagnostic source, never call brush/pointer operations. Return full source readback hashes plus fixedscale common roundtrip SHA **before allowing any solve**. Reject incomplete paper/geometry/context or already-used engine.

After root review: GPU source roundtrip on one synthetic and one captured fixture, then original/lazy/one-octave/cache on the exact same constructed source, source SHA before/after each run. Historical authored native13 recipe and current deployed runtime remain untouched. Timing excludes upload/readback verification; output uses the same declared common compositor. Physics/result similarity to recorded native is not asserted by byte roundtrip.

# Lazy loop-invariant film: isolated candidate

Only FrontFilmHoist.mjs transform; no runtime/native shader installed. On first
valid neighbor (after unchanged bounds/ci skip and height/relief operations),
compute the identical literal film expression once and reuse it. No operand
reassociation, min order, edge multiplication or Q8 storage changes. Zero eligible
neighbors compute no film, as before. Coverage/foreign textures and uniforms must
remain read-only, output distinct; all operands finite, positive costMax and valid
stride required. Original and cached source bodies plus manual/hardware input
sampling variants were checked by restoring transformed code byte-for-byte.
Sampler variants affect source reads only; film retains its exact manual fourtap
foreign interpolation. Lazy climb/source scheduler remain unchanged.

4096 deterministic finite f32 scalar cases include film thresholds0/.02/.15/1,
stride1/2/8, outside neighbors and ci>=.999: float result/Q8 exact before vs after,
film evaluations0-or-N→0-or1. This oracle tests scheduling of an invariant, NOT GPU
texture interpolation/transcendental/compiler correctness. GPU CSE may already
remove repeated work; no performance claim. Future one bounded same-input actual
10-role/decoded-endpoint gate and timestamp aggregate needed. Full shader f32
rounding/NaN/out-of-range behavior not established by this scalar oracle.

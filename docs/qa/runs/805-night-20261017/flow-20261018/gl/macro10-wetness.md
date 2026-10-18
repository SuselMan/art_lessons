# V10 separate wetness and local reconstruction controls

New files only; frozen V8/V9 bodies untouched. Uses coordinated V9 fourth
options pairSourceOverride/packSourceOverride. Export `wetnessDefinitions`:
`wgsl-macro-local-smooth-control` (V9 physics256, local pack) and
`wgsl-macro-wetness-conductance` (new physics256/384, same local pack).
No seeded dither here: round-half-up integer pack remains the control.

## Physical counterexample and bounded new rule

Old q~gradient(W), carried pigment q*M/W gives approximately scale-invariant
velocity gradient(log W). A narrow own-water stroke beside dry paper has
strong lateral gradient even at low W; a uniform prewet pool has none. Ratio-
only mixing also treats equal low-W neighbours like equal high-W neighbours.
Thus an exact conservation ledger is insufficient evidence of wet-in-wet.

New q=round(q0*floor((Wa+Wb)/2)/65535), using the old bounded q0. This is a
phenomenological saturation-dependent conductance, not a CFD derivation.
New carrier k first computes old wet-ratio64*minW/maxW, then multiplies by
min(minW,16384)/16384, floor. 16384 codes means original normalized water1
because initial coarse surface stores water/4. q uses the full u16 capacity
65535 (water range4). No fixture positions or image-derived width targets.
All pair exchanges/adsorption/capacity operations remain integer and paired.
Extra products: q0*meanW+32767<=65535²+32767<2^32; k*16384<=1048576.
100000 random states preserve all4M+D and W+S sums, positivity/premul/capacity.

1D CPU cross-sections:128 alternating local phases, initial pigment2cells,
paper128; own water35/70/100 versus uniform pool200. Old outside RMS82.1/
82.7/82.9px, inside50.3. New outside6.18/7.55/8.65px, inside33.17. Global
pigment exact60000 codes in each case. This is a useful counterexample family,
NOT proof the actual 2D through-pool art is fixed: it can over-pin low-water
edges and slow all flow. Actual dynamic-stroke/parallel-stroke/real captures
and cross-device fullRGBA remain mandatory. Initial absorbed S is still0;
inputs do not distinguish previous absorbed prewetting from fresh surface.

## Local fallback and exact qualification

Only pixels whose literal stationary alpha>0 use nearest own-cell M+D;
all other pixels use full-sheet integer halfpixel bilinear. The local nearest
pixel has existing per-cell fine free-alpha capacity. Other pixels have no
stationary pigment, so convex bilinear alpha<=65535 guarantees output<=255.
No clamp/saturation or silent drop. Shared quantization preserves premul.
CPU100random coarse fields/fine stationary maps check range/premul.

Changing rows of an interpolation matrix destroys its exact column sums.
We DO NOT retain the full-sheet mass certificate. Per-channel prequant code
sum delta versus full bilinear is bounded by Nstationary*65535; final byte
sum difference bounded by Nstationary*255. Full bilinear+stationary can itself
be unsafe, so it is only an error reference, never a correctness oracle.

Read-only five REAL initial fixture maps saved in macro10-initial-maps.json,
including binary SHAs (no arrays). Mini stationary1pixel, sheet7 2pixels,
sheet3/near-colors0, waterdrop211pixels. Initial local-vs-full-bilinear alpha
byte-sum differences +12,−5,0,0,−2091 respectively. These describe INITIAL
coarse material, not evolved output. Final dynamic delta still requires GPU
coarse-output observation; do not infer it from tiny stationary alpha alone.

Five CPU tests PASS, strict/noUnused0. Mock tests exercise actual factory
source override, live metadata getters/JSON, upload/run/dispose. Not WGSL
compiler or GPU proof. No GPU/browser/service/temporarybuild created.

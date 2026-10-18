# Fixed capillary capacity RCA

Gate: `final-capillary-followup-results/report.json`, gallery-sheet-12-slot-1,
`wgsl-macro-dynamic-wetness`, grid128/steps96/flow.18/mixing.12/suction.15/
absorption.025/capacity.35/staining.7/wetThreshold.0001/finePaperGain.5.
Actual GPU fineLedger: overflow469; dryMaterial/invalid/negative/inactive0.
This is a real prequant capacity failure, not a PNG or threshold exception.

Independent CPU f64 replay on the saved six-plane input reproduces two causes:
coarse max M.a+D.a 1.111317299048496 (5 coarse cells >1), then original
normalized paper weights yield max 1.3323561727784208. A tail-only weight fix
cannot repair already over-capacity coarse source without loss or relocation.

Fixed-policy-only correction (ordinary historical default unchanged):

- Accepted water flux uses receiver OLD available alpha capacity divided by
  total proposed incoming pigment alpha. All RGBA and water use the SAME
  coefficient. Rejected water and pigment stay in the donor. No outgoing
  capacity credit, no cyclic admission, no final clipping as a remedy.
- Concentration mixing uses an edge-symmetric coefficient limited by the
  receiver's total positive incoming alpha. Equal-alpha RGB exchange remains
  enabled. Scaling original convex edge coefficients downward preserves
  positivity/premultiplication. Adsorption still transfers M→D locally.
- Weighted reconstruction flattens normalized weights affinely toward1:
  `s=clamp((1/A-1)/(maxWeight-1),0,1); w'=1+s*(w-1)`.
  Sum weights is unchanged in real arithmetic; saturated cells become uniform.
  Invalid coarse A>1 remains visible, not silently clamped.
- Actual ledger now exposes coarseOverflow/coarseMaxCombinedAlpha independently
  of fine overflow. f32 signed conservation deltas remain explicit.

CPU corrected sheet12 replay: max combined alpha0.9998355410105728;
all4 total M+D deltas [1.42e-14,5.68e-14,1.78e-14,5.68e-14].
This is f64 evidence, NOT GPU f32 proof or bit-identical optimization.

Tests: capacity oracle3PASS (30 randomized occupied grids×32steps, normalized
weights10k, opaque equal-alpha RGB mix); actual capillary/f32tail8PASS;
92-choice actual factory/source coverage1PASS; strict TypeScript0 diagnostics.
CPU mocks do not compile WGSL. No new buffers or passes; accepted-flux shader
recomputes neighbor proposals, weighted INIT scans cell weights per pixel.
Extra GPU cost is unmeasured and must not be advertised as an optimization.

Required device gate before matrix: exact failed sheet12/config first, then
three capillary IDs bulk/partial + thin1/2/7, dry/water-only and mini-wave.
Require actual coarseOverflow/fineOverflow/dry/invalid/negative/inactive all0,
all4 f32 deltas reported, independent raw dry/premul check, source/input SHAs.
Historical default shaders/dispatch remain unchanged. This changes bounded
fixed-policy physics; source policy must be versioned in the new frozen build.

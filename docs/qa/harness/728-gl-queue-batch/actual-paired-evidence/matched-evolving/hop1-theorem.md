# Hop1: proof, calibration and actual failure

For every highROI transport edge `(dx,dy)=8s*(±1,0),(0,±1),(±1,±1)`, both endpoint coordinates agree modulo8. Sum of each P/C channel over any of the64 residue classes therefore stays fixed: outgoing and incoming flux cancel within that class. Evolving fractions/pressure and diagonal directions do not change the proof. This is a property of the experimental positive highROI helper; canonical works on low128 fields and material reconstruction, so this is NOT proof of a canonical defect or sole cause of visible angularity.

At a constant driver let `μ=Σ f_d d` and `Q=Σ f_d ddᵀ`, including stay probability1−Σf. One hop8 gives mean8μ, covariance64(Q−μμᵀ).

- Eight hop1 substeps with same fractions give mean8μ, covariance8(Q−μμᵀ): transport speed matched, diffusion8x lower.
- Sixty-four hop1 substeps with each opposite pair's SUM retained and DIFFERENCE divided8 give mean8μ, covariance64Q−μμᵀ. Local raw second moment matches, but accumulated covariance adds63μμᵀ relative to hop8. At zero drift it matches diffusion exactly; not generally identical.

Continuous fractions are bilinear interpolation of nonnegative coarse common fractions. Convex interpolation preserves positivity and donor sum<=1 (CFL); pair symmetrization preserves sum/nonnegativity. Same fractions scatter all8 P/C moments, so channel masses and donor-convex hue survive. Dry endpoints/corners veto flow. Positive outward flow demands larger ROI; no frozen-boundary workaround.

Synthetic radial zero-drift oracle: same M2 to1.14e−13, h4 outside radius4 decreases .096744→.027629. This demonstrates isotropic small-hop diffusion in the controlled primitive, not real watercolor acceptance.

ACTUAL matched snapshot: oldhop8 evolving M2=206.57557/h4=.0299438/peak=.480010; speed8 evolving206.72228/.0389618/.612968; moments64 evolving207.17735/.0263844/.517068. Viewed PNGs show directional spikes/streamers, stronger core. Both hop1 variants are visual FAIL despite mass/hue/dry PASS. Thus breaking residue conservation alone does not solve quality; interpolated coarse pressure/current-density donor imbalance can still advect into nonphysical-looking structures.

Do not port this to GPU/production. Next investigation should isolate actual driver advection versus diffusion (including capacity/potential and source reduction), using the SAME retained data. No new device run is needed to reject these two candidates.

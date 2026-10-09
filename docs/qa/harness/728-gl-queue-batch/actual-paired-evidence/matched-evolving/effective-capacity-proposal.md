# Narrow mathematical review: reversible paired conductance

No runtime/model replacement implemented. Captured film.alpha is `clamp(solvent.r/solvent.a,0,1)` wetness, not physical water volume. Whole-puddle solvent amount is not retained in this capture. Consequently w below is **approved positive effective capacity**, not a measured water-volume claim.

Let m_i^c be each of8 nonnegative P/C moment masses, w_i>0 a fixed effective capacity in a connected wet cell, and G_ij=G_ji>=0 shared face conductance. Dry cells and corner-cutting faces have G=0. Define

m_i'^c = m_i^c + dt Σ_j G_ij (m_j^c/w_j − m_i^c/w_i).

Equivalently each donor i sends common fraction f_ij=dt G_ij/w_i of EVERY channel to neighbor j and retains1−Σ_jf_ij. CFL: dt Σ_jG_ij/w_i<=1. This is positive, conservative (pair terms cancel), channel-common and hue-convex. For concentration u_i^c=m_i^c/w_i,

u_i'^c=(1−dt ΣG_ij/w_i)u_i^c+dt ΣG_ij/w_i u_j^c.

It obeys a concentration maximum/minimum principle. m_i^c=w_i C^c is stationary exactly. Density m_i can legitimately grow where w_i is larger; density maximum alone is not a correct physical constraint. Auxiliary colors diffuse even when total pigment concentration is uniform; avoid a one-direction flux driven solely by P.a that freezes color mixing in this case.

Detailed balance of common transport is w_i f_ij=w_j f_ji. Actual directed/path-normalized donor weights do not generally satisfy it; fixed highsource plus coarse four-centre density may additionally reverse local order. These are separate issues.

Two proposed orthogonal discriminators (NOT RUN):

1. **Reduction alias only:** preserve actual directed mobility/capacity and timestep, replace four-centre coarse currentP by exact8x8 finite-volume mean of SAME highcurrentP (outside ROI capturedoldP unchanged). Compare exact fine-order reversal/peak witnesses, not quality tune. This tests sampling alias, without symmetric-operator change.
2. **Directed coefficient only, after review:** retain captured four-centre density and chosen effectivecapacity, symmetrize edge G and use common reversible coefficients above, with explicit CFL substeps and physical time calibration. This is a new visual model, not algebraic optimization of actual carry. Needed capacity provenance must be named before any claim about P/water.

An initial symmetric choice is G_ij=k H(w_i,w_j) a_ij where harmonic H and a_ij are symmetric nonnegative wet/paper mobility. Choosing a from actual directed mobility by (a_ij+a_ji)/2 changes physics; it must be declared, tested and judged separately. Existing pressure can limit connectivity/mobility as its front evolves, but cannot silently become water amount. No new hardware is required for discriminator1; no production/GPU implementation before causal review.

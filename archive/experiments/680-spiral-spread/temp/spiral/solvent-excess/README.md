# Multiscale solvent CPU experiment

Actual wet domain and pre-front P.a, same finite solvent-source surrogate as solvent-volume. Two cycles 16/8/4/2/1 cell strides, separated horizontal and vertical face operations. 4px grid: longest64px. Every intermediate pixel must belong to wet domain; no transport through dry gaps. Flux .2 Δ(V-base), shared upwind P/V fractions; source uniform upper bound in loaded-contact units, not reconstructed actual water delivery. Head V-base assumes retained equilibrated film plus mobile extra solvent. This is a new physical closure needing review, not established engine semantics.

20 face operations outside spiral: constant mobility5.5104%; legacy alpha closure3.6826%; concentration carrier/V closure4.3927%. Stationary no-extra-source blob exactly unchanged. P and solvent mass preserved; constant concentration invariant exact in this CPU run. Actual pigment strength unavailable in captured fields: carrier used as concentration surrogate; cannot claim Pstrength/V tested.

Unrestricted ΔV coarse transport moves control blob even without source (1.8% outside) because base film has heterogeneous boundary. Rejected for compact-blob preservation. Source-only head avoids that artifact explicitly.

Long edges approximate accelerated hydraulic transport, not a converged discretization of local Darcy diffusion: local96 faces give .966% while multiscale20 give5.51%. Need physical time calibration and actual independent solvent state before integration.

GPU cost: WebGL1 without MRT must update V,P,C separately from immutable old state: minimum60 draws for20 face steps. Safe donor bounds/precomputed wet-path gates may require more. One1536²RGBA8 buffer9MiB; independent V pingpong18MiB, retained base9MiB, separate pathmask9MiB if none reusable. Exact allocation depends on mainagent state. CPU axis pairs may overlap and require GPU parity/split implementation. No GPU started; no candidate handed to user.

# ONE split CPU result: visual FAIL

Same actual matched capture, gA=gD=g/2, 12×64. Front-directed +gradient arrival-cost advection then symmetric high-local diffusion. w=1 mathematical effective capacity, not measured water. Default OFF; canonical and hardware untouched.

Evolving12 M2=235.586975, h4=.02805437, peak=.42231912 (source .43529412). Mass max abs error5.46e-12; hue/dry errors0; immutable source, no outward fallback, CFL PASS. Maximum advection incoming rowSum1.0075834; maximum single-operator peak growth .0003909694. Lower final global peak does not imply a maximum principle for advection.

PNG personally viewed: more movement than symmetric diffusion/radial control but a visible squared/grid ring structure has returned. Reject as artist candidate; do not port to GPU. Compared symmetric-w1 M2=191.961/h4=.00302 and radial M2=220.542/h4=.00361, coherent isotropic motion was not achieved.

Important policy limitation: eligibility inherits homogeneous control full pressure-band/wet/corner support and bilinear lifted fractions, not literal original uphill path bits. Therefore this is a scoped causal split trial, not an exact implementation of proposed path-policy. Flat gradient gives zero advection; direction is normalised arrival-cost gradient, not hydrodynamic pressure. Frozen driver64 unit substeps, CPU Q8 front approximation and optical display remain explicit limitations. No parameter sweep or automatic retry.

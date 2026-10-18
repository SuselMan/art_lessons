# Wetting-front adsorption: separate artistic hypothesis

Standalone `webgpu/macro12-front-adsorption.ts` exports
`frontAdsorptionDefinitions`, id `wgsl-macro-wetting-front-deposition`,
steps256 and edgeStain0/16/48. Uses V10 integer wetness conductance and local
reconstruction. No old source changed. edgeStain0 is the numerical control.
Compiled coefficient before timing, same dispatch count; four additional
coarse neighbour reads for nonzero edgeStain, no new buffers/draws.

## Mechanism, not a post-painted outline

After each pair's water/pigment movement and ordinary adsorption, extra mobile
M is transferred to deposited D. Front detector reads MAX water over all four
old-state neighbours. It does not use only the active pair orientation.
Only the lower-W side with positive water AFTER movement qualifies.

strength = edgeStain ×relative neighbour water contrast ×low-surface-water
  deficit ×remaining absorbed capacity ×paper valley affinity,
with integer truncation after each bounded factor. Deficit vanishes when old
W>=2048 codes (1/8 original normalized water unit); without this gate a W100
pigment line inside a W200 pool would be mislabeled a wetting front and the
initial hard line would be pinned. Soil unsaturation uses old S/absCap.
Paper affinity128+(255−paper)/2 biases trapping toward terrain valleys.
All factors<=1, edgeStain<=128 means extra fraction<=1/2 of mobile/phase.

The common transferred alpha is rounded Mα*strength/256; RGB proportional to
accepted alpha. Identical amounts are subtracted M and added D. No new color,
rim multiplier, output brightness adjustment, water loss or evaporation.
M+D capacity is unchanged. Retained D subsequently cannot advect, so any edge
accumulation must come from transport and trapping, not added pigment. It may
also over-pin fronts or accentuate the8px grid: actual images decide.

This is phenomenological wetting-front adsorption, NOT classical coffee-ring
reproduction, full shallow-water CFD, or a reconstruction-only optimization.
Existing literal dry pigment is NOT resuspended by later-arriving water.
Input still starts S0 and cannot represent previous absorbed prewet history.

## CPU checks and limits

Five tests PASS, strict/noUnused TypeScript0. 100000 front transfers (many
low-W states) preserve all four M+D channels exactly, W/S unchanged, positive
premul and local capacity. Equal wet pool and W100 line in W200 have zero
EXTRA deposition; no-pigment water does not create color. Four orientations
of a wet neighbour yield identical front detector. A whole12×12 dynamic water
and pigment drop128 phases preserves exact ledgers, has IDENTICAL W and S
trajectories at every cell for edgeStain0/16/48, and stronger front stain
increases D by redistribution. Mock actual factory tests compile source
strings only, exercise upload/run/dispose; NOT WGSL/GPU compilation proof.

Extra numerators: watercontrast<=65535*256, soil<=24512*256,
strength<=128*256, Mα*strength<=65535*128, proportional pigment
<=65535²+32767, all fitu32. No float shader arithmetic or hidden saturation.
Local reconstruction retains V10's declared non-exact interpolation mass
qualification. GPU zero controls, baseline0 equivalence, all-channel ledgers,
cross-device fullRGBA and actual PNG review remain required.

## Primary context

Curtis et al., [Computer-Generated Watercolor (1997)](https://grail.cs.washington.edu/wp-content/uploads/2015/08/curtis-1997-cgw.pdf),
sections2.2/4.5 distinguish transported mobile pigment from adsorption and
separate edge darkening while drying from capillary backruns. Their model
contains richer flow/adsorption/desorption mechanisms; this small integer
front trap is inspired by that distinction, not an implementation of their
solver. No quotation or claim of matching physical parameters.

No GPU/device/browser/service/process or temporary build created by author.

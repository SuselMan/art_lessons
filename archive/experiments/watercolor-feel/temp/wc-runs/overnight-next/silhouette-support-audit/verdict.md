# Silhouette support: evidence, not a new shader variant

The actual 9/3 physical22 coverage is almost an ideal uniform ellipse. Threshold1 support37994pixels, threshold240 support37892pixels: only102pixels differ; bounds957,836→1220,1022 unchanged. Area/covariance-matched ellipse area=.999264 across thresholds. Only619 high-coverage pixels have standingB0; standing union is nearly full over oval.

BrushPass writes pigment/optical records, not coverage. Its flux requires BOTH source and recipient inside contact footprint; scissor is same footprint. Therefore arbitrary pigment displacement outside the swept nib is impossible in current brush stage, even if there is standing paperwater beyond. Changing donor velocities/contact strength alone cannot deform this silhouette.

This endpoint restriction is reasonable for **direct mechanical contact**, but it is not a model of water being pushed beyond the nib: that would require an existing waterfront/freewater transport stage to supply receiving wetted domain. Removing endpoint mask alone would transfer pigment into cells whose water/coverage are undefined, and composite would still hide it. Not a safe causal fix.

The dry photo9/3 visibly has asymmetric, torn upper-left boundary, more oval smooth lower-right boundary and irregular deep internal swirls. The user's photographed motion is not the recorded digital path: no claim of exact path alignment or a mathematically forced expected exterior region. These records prove the current support's near-ellipse and the inability of pigment-only brush transport to alter it; they do not prove where real paint must move outside it.

Next discriminating measurement: initial deposited coverage vs after mode11/front/carry vs final, with world registration. If initial support already matches final near-ellipse, source path/contact geometry sets the oval. If it becomes elliptical at mode11/front, domain construction is responsible. Need stage support masks rather than another velocity perturbation. No new GPU run/spec in this audit.

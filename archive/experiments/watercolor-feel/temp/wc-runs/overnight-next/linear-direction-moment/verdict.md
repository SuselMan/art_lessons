# Linear directional exposure moment, CPU-only

Actual input is original fixture dabsPacked plus actual producer profile/filter/travel quantum, SAME prior CPU actual-kept reconstruction used in flow-border audit. It is NOT inverse reconstruction from RG/B flowtexture; captured CF alone cannot recover history. No actual in-engine brushTravel tape saved for these fullfixtures, so scalar reconstruction fidelity remains explicit limit.

At each cell z=sum(length/R * water *shape), mx=sum(dx/R *water *shape), my=sum(-dy/R *water *shape). Unquantized state (z,mx,my) adds associatively, order-independently; mean m/z has norm<=1 by triangle inequality. For CONSTANT R, R*z*mean equals sum recorded displacement weightedwater/shape, unlike recency EMA. Constant-direction negativecontrol exactlysame mean; B=1-exp(-z) is unchanged algebraically. This is additive source moment theorem, NOT fulltransport semigroup: endpointmin, moving domain/donor concentration/caps, repeated nonlinear stepping and MAXsource/history prevent it.

Synthetic equal opposite exposures give EMAmean −tanh(.5)=−.462117 but linearmean0. Orthogonal equal exposures EMA(.268941,.731059) vslinear(.5,.5). Those are illustrations only, no gallerydata.

Actual samepad4 flow fields:9/3 weighted mean absolute RG sum difference1.398codes, largest8;9/2 mean1.672,max7;6mean.849,max29 sparsecorner;1mean.346,max22;8mean.596,max13. Divide127.5 for vector-component magnitude:9mean about1.1%,8about.47%,6.67%. B bytes unchanged allthesefixtures.4one Bbyte differs because currentFloat32recursiveweight vsnewFloat64exp exposes quantizationtie, not intentional dosechange.

Radius variable: Rcontact=maxR means Rcontact*sum(dx/R_i...) is not sumdx; it weights smaller-radius contributions by Rcontact/R_i. Momentlaw does not solve this bias. Deriving radius-weightedphysical displacement then normalizing to exposure changes interpretation and must keep boundedCFL. Don't claim integrated worlddisplacement exact with changing radius.

Decision: mathematical alternative is cleaner as a future recorded directional moment, but currently .5R contactpartition makes actualmean differences tiny. NO immediate GPU variant; no shader/source patch written. Would not use a costly round for sub-percent average direction change while main observed morphology deficiencies persist. Rare6corner large difference is not zero, but fieldmean does not predict visualwinner. To revisit, obtain exact travel tape/CFmatchedcapture and isolate thosecorners rather than claiming9cloud breakthrough.

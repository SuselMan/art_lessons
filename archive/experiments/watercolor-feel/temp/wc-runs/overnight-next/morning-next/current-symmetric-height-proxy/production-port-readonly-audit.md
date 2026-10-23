# Selected final50 source port: independent read-only audit

Examined five engine diffs against frozen production-symmetric-soft16-optical-gain55.json. No engine edits by reviewer.

- Source headroom .5 appears at all four profile deposit sites. normalizeDeposit=true only watercolor profile; other marker/soft/pencil profiles false, so mass scalar does not alter their direct opacity branch.
- Ribbon paired source uses amount×bandWater/Wet/strengthRatio, colour depth linear in amount rather than original ink². WC composite record decode×2, physical density/front thresholds rescaled; coverage and WC_DEPTH_SCALE4 remain unchanged.
- Remobilization colour-first explicitly reads physical c/b via separate c/e sampler before physical c/b modification. Temporary a/spare copied back before reused. No sampled output framebuffer alias in this sequence.
- Brush colour output field.band, physical output field.pressure read SAME pre-step dep.out and col.out; both results copy back afterward. Source/output objects are distinct in those calls. This is paired pre-state, not independent colour scheduling.
- Final operator is FOUR axial neighbours and EIGHT material channels. It uses plain per-channel floor, shared eight-channel recipient quarter-capacity; no stochastic/CDF/tick phase. Corrected metadata must not call it an eight-neighbour geometric stencil.
- Selected symmetric face coefficient1/(2√2), endpoint-min log exposure, mixing .02 PER SUBSTEP, optical gain.55 and shoulder cap1.6 match actual final spec. Not normalized total mixing across substeps. Exchange is anisotropic diffusion, not directed incompressible flow.
- Contact pad4 and paired one-canonical-cell scissor/copyback halo match. transport radius4*S gives step1. No out-of-copyback flux past halo because contact B outside flowRect0; coverage endpoint/midpoint global wet gate retained.

## Remaining material risk: scheduling/allocation

Experimental hop64 and sum8192 throws were removed, correctly avoiding arbitrary paint truncation. For R200,S1,zmaxlog255, hop=ceil(.2R*zmax√2/.84)≈374. The CFL still holds because gain decreases with hop. However prepare builds an Array of a closure for every microstep before yielding. Long size400 strokes may allocate hundreds of thousands of closures; existing GPU slice processing bounds execution units but not this upfront CPU allocation or plan construction.

A lazy contact/substep iterator is the principled next fix: retain per-contact upload/rect state and current sub index, produce exactly one paired step per scheduler unit, preserve identical order/count/gain. Its finish must run once, after contacts. No cap/truncation. If current API ops Array is retained for this release, measure actual long-size400 plan construction time/heap/maximumops before claiming bounded smooth operation; no synthetic pass label.

No production H proxy included. Separate feasibility-after67.md details missing source-water state, replay/checkpoint lifetime and bounded H work units. Human better67 is fixture preference, not proof a future-pose CPU model can ship.

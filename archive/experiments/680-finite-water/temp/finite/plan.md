# Landing / water reservoir causal trials

Stable segment mechanics candidate: 0e25da85 on 5294. No modifications to that runtime.
New isolated source: 680-finite-water, branch agents/680-finite-water, port5295.

Landing trial FIRST: only diagnosticLandingPolicy dry→fluid, diagnosticWaterPolicy legacy. firstAvailable=max(landedWet,standing(initial1)), invariant across segments. Removes dry excess6 applied to already-wet inputs. Eight correct paired inputs: actual15 47→48 vs48 and synthetic100 prewater/direct, eachdry/fluid. `rasterqa.mjs` captures coverage/ink/depth AND target appearance beforefinish, finalaftersettle, source descriptors.

Water policy trial SECOND, not mixed into landing conclusion: legacy vsfinite(allpigmentlevels) vsbottomless(alllevels). Source water clocks separate from pigment clocks; optional harness resamples actual PaperWetness after clear stroke rather than using historical e/f. Conditional waterLoad was previously gated by pigment>0. CPU proof alllevels same under chosenpolicy. Purewaterink/depthmuststayzero. Changing priorwaterinput is a physical model choice, cannot infer transport origin from it.

GPU queued behind spiral and morph, not launched. Need actual finite cases PNG/fields, GL and canonical/rebuild before reporting effect or committing result.

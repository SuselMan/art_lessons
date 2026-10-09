# Actual evolving front admission

Current source audit: `WatercolorPasses.diagnosticStaticPaperCache=false`; preview calls actual `waterFrontStep` without enabling it. The prepared static-only reader MUST reject this baseline. No device probe or flag flip to obtain a PASS.

Minimal baseline-support candidate for review:

1. Before original front draw, synchronously clone complete128 Q8 cost/seed, low water film and foreign film. Freeze owner/epoch/source/paper identity, actual world origin/scale8, costMax/dryCost/climb/floor/stride. Do not use old cropped fluid outside-zero.
2. After original front draw/endDraw, clone actual128 output. In this owned diagnostic hook only, render exact existing `WC_STATIC_PAPER_PREP_FRAG` into one transient RGBA32F128 target (262144 GPU bytes), using SAME paper texture/filter/wrap, stamps noise, world uniforms and highp. No canonical flag or shader substitution. Read height/effectiveClimb then delete target/FBO/program. Support/FBO failure is explicit.
3. Preserve/restore actual GL program, framebuffer/viewport, active unit and every touched texture binding (paper/noise), array buffer/vertex attribute state, blend/scissor state. Existing StaticPaperCache.ensure restores only FBO/viewport/active unit; it cannot silently be reused as a fully transparent diagnostic helper.
4. CPU oracle receives full actual operands. Compare predicted front with actual Q8 output at all4channels, tolerance1/255+2e-6. SHA after immutable capture; lifecycle callback disarmed immediately. One draw, no animation/performance assertion.
5. Only after this primitive PASS: evolve pressure through existing front expression, rebuild actual four-axis path mask each step, then common positive P/C donor. Diagonal8 remains optional/modest; matched spread h4 benefit only15%. Pressure chronology/front-budget and stride are actual source options, not a new diffusion schedule.

Existing static branch uses its prepared Float32 operands, zero extra texture. Baseline transient preparation budget .25MiB; retained front raw payload <=448KiB plus actualoutput64KiB. Existing actual paired capture .5625MiB total; retain only meaningful one-state result. GPU copies/readback perturb timing; no fps claim.

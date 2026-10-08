# GL2 carry pair: diagnostic-only

`WatercolorPasses.diagnosticCarryMrt=false` by default. Separate lazy MRT program ONLY when requested; original FIELD_OP/Adreno source/program initialization remains unchanged. Native prior results are not GL proof.

## Dependencies and exact contract

Actual generic plan calls optional `carryPair(Pnext,Pold,Cnext,Cold,fixed,k,opts)` in the existing carry step immediately before legacy16(C) then15(P) fallback.16 reads Cold and OLD P,15 reads OLD P; neither reads Cnext. Both ping-pong variables advance only after the two results. Therefore two independent RGBA8 render attachments may be produced in one draw, with every iteration's Q8 boundary retained. This does not fuse successive iterations, contacts, front or diffusion.

`carryMrt.ts` extracts literal original helpers/body from `WC_FIELD_OP_FRAG`. All scalar weights, capacity, Ti/Tj, coefficients, incoming/outgoing conditions and their order remain. Sampler alias proof binds original colour's u_c and pigment's u_a to SAMEoldP, replacing both m by that unchanged value. Separate P/C vector accumulators apply the identical original scalar expressions in the same order and independently apply original WC_FIELD_FIT; no shared normalization/rounding. This is not a float reassociation optimization. GL compiler/multiple-target precision still require same-input pixel gates.

Input/output texture aliases or differing destination dimensions reject; MRT FBO detaches both textures in finally, so pooled outputs aren't held alive. Context restoration/destroy releases the optional program/FBO. Additive-zero-face experimental mode falls back to original15/16; no silently incomplete equation port. No cross-context readback/upload, no extra field allocation. Options/world/path/dir normalization match fieldOp exactly.

## Software primitive gate

`node docs/qa/harness/728-gl-carry-mrt/build.mjs && node docs/qa/harness/728-gl-carry-mrt/check.mjs`.

Actual old16→15 vs new paired MRT, sameOLDinputs each step;31×29 and32×40,4iterations,stride1/2/3,costLINEAR, scissor. P/C0bytes/max0 each iteration, errors0; nonzero transport first step (958/1360bytes,max13). Original Q8 output becomes next iteration input. Software only, not hardware or wholemodel validation. Signature/unit tests preserve literal donor expressions; frozen generic-plan chronology remains unchanged.

## Performance gate pending

Actual original GL2 mode15/16 GPU cost must be measured separately from RAF/wall before predicting a benefit. Baseline cost survey instrumented only existing fieldOp; no paired shader activated. Whole candidate gate must compare ALLfields/material/export and count actual paired calls.2A→Afragment invocations and2→1draws do not imply2×GPU time; record bandwidth remains two RGBA8 writes, register pressure/compiler scheduling may worsen. Expected whole gain currently unknown. Surface held for parent's INIT gate; no GPU device run performed for this carry candidate yet.

# Material transfer support vs backward dependency — external proof draft

CI support certificate for the opt-in fixed-window skip. This document does not enable the feature, alter shader math or justify a cropped solver.

## Unconditional structural results for pinned approved40/S1 schedule

Actual execution (one/two paint metadata) gives full backward dependency max612. A donor-only graph, ignoring pressure/mask/height coefficients but including material donor offsets, gives conservative450: carry strides sum254, diffusion and conservative sampler supports to416, finalgroup binomial to450. This is not tight. Copy/unknown initialization are conservatively handled; auxiliary outputs are not confused with paint. Unknown mode rejects.

Stronger shader gate theorem: pre-guard P/C support is contained in S UNION current extended coverage support. S contains allRGBA inkLoad/inkColor/coverage/local/foreign/combined water, not original dry RGB.

- Fresh contrast and P.b alignment preserve zero outside local rawP/C. Coarse background/selection can be nonzero globally, but multiply local material; they do not inject pigment.
- Carry15/16: out begins a. Incoming aj is only considered when recipient ci<=carryBand=(budget-1.5)/costMax. That is strictly inside coverage-extension threshold (budget+1)/costMax. Coefficients, pressure, capillary and donor normalisation do not generate material when all donors zero. Approved finite/positive capacity assumptions remain those of existing zero-invariant.
- Diffuse: recipient coverage.a<=.002 gives wi0, branch does no exchange and returns originalink. Every new nonzero recipient therefore lies in extendedcoverage. Long radius21/32 jumps do not change this recipient cap.
- Bookkeeping/add/remobilization/slices/fibres are pointwise in MATERIAL donors; field reads at3/10px alter coefficients only. Both fixed/mobile records remain in S UNION coverage.
- Group tide pressure is mode19 from CURRENTcoverage, exactly1 outsidecoverage. No outward relaxation modifies that pressure. Group mode6 inside=0 there (threshold.5..625), tau0 removes backrun, so band.b=0. Mode14 may gather material31px but multiplies every new gathered contribution by band.b. Thus it CANNOT create pigment outsidecoverage. Existing a can persist, hence unionS. Finalcolour reconstruction2 preserveszero. Raw contour coverage is published separately.

This proves the SUPPORT CAP theorem conditional on actual sampled zero/gate semantics. It does not by itself bound coverage expansion.

## Dry-exterior numeric coverage bound (conditional, requires GPU admission)

Actual schedule is pinned: radius40,water1,effectiveWet1,standing1,S1 =>budget96,costMax100,dryCost48,floor.85. Outward prefix8 has25 writes:17 stride8 +8 stride1. Inward/group45totalfrontcalls are NOT additional outward pressure propagation.

If no foreign stencil exists, rawcoverage is zero outsideS. An axis path to a point distanceL outside the support rectangle union must cross L units of dry exterior after its last intersection with S. Unit edge hard lowerbound is floor*dryCost=40.8 regardless paper/noise/climb. Diagonal length>=1 only increases it. Film lookup must respect certified point/linear support; add conservative8px support slack, not a new physics offset. Ignore coefficients for material transport only after recipient gates above are proved.

Pessimistic admitted numeric contract:
1. Fragment highp precision>=23, finite approved arithmetic.
2. UNREACHED normalizedcost1 is an exact fixedpoint in nearest source/prefix/native front. No spontaneously lowered sentinel is permitted.
3. Aggregate source lowp sampler + UNORM write + highp arithmetic error can reduce an outward cost by at most4 RGBA8 normalizedcodes per draw. This deliberately includes sampler error, not only framebuffer conversion.
4. Prefix packed-edge underestimation is at most1 costunit per unitpath. Build draws disableDITHER, encode rounds UP to16bits. With lowp sampled component absoluteerror<=1/256, byte decode is off<=1; costerror e<=100*257/65535~.3922. Binarytree stride8 has14 decode contributions plus finaljump1, so <=15e/8~.7354cost/unit; remaining highp/representation allowance is >.26/unit. Stride1 bypasses packedbuild. No ambient saturation may turn a sentinel100 into a reachable path.

Then (40.8-1)L <=97 +25*4*100/255, hence L<=3.422... and conservative ceil4. With8px support slack <=12. Choose certified Rmat32, not3. 32 is a deliberately loose support bound, not a measured stylistic radius.

These numeric assumptions are NOT proved by CPU MockGL, source SHA, shader highp qualifier or same-GPU dimension equality alone. In particular an adversarial sentinel losing4codes everypass would become reachable everywhere; a negative test demonstrates this. Driver admission must test sentinel/packed/rounding contracts and actual full baseline versus tight-skip preGuard P/C, coarse and final bytes. Unknown/changed schedule/shaders, foreignSources/stencil or proof provenance MUST use612. Do not claim a universally certified32 yet.

## Safe first experiment

Keep ALL existing1536 field origins, halo, cores and input restores. Only change group keep distance612→32 when explicit QA certificate is present and no foreign stencil can be generated for this immutable revision; all unknown foreignmetadata falls back612. Capture proof should record exact metadata used by Native, not infer absence from zero foreign plane (foreign stencil comes independently from recorded sources/contacts). A null/empty trusted source list implies no stencil; nonempty/unknown conservatively falls back even if current contacts appearempty. Mutation of revision/metadata invalidates proof/cancels job.

All global Contrast/Background phases still run over full logical fields; skipped P/C pages may be zero ONLY through preGuard support theorem. Rawcoverage copied for skipped cores. Native geometry unchanged, so no new artificial boundary or noise origin appears. This is materially safer than input-cropping. Do NOT implement S+612 inputcrop: an eventual crop would need S+Rmat output extent PLUS backward612 independently and global-boundary/coordinate proof. Rebase intentionally deferred.

## Tests and source contract

9 production CI tests in1suite: actual donor/full graphs, exact schedule25/45 and sourcefilters flags, algebraic bound, adversarial rounddown min-plus halfplane simulation (more permissive than finitebbox), sentinel counterexample, every certificate field missing/changed=>612, all execution/shader/sampling source SHA pinned. The final test pins complete source SHA256 for Plan, shader source, FrontPaths, Passes, sampling, presets, diffusion schedule and Native target. Current tests use CPU MockGL, not shader execution. If any pinnedfile changes review is mandatory.



## CI maintenance

M70MaterialSupportProof.test.ts uses real production Plan/Passes and test-only support helpers. It does not write traces into the checkout. Nine tests cover four actual graph/schedule combinations, three numeric assumptions/counterexamples, one fail-closed certificate and one source-SHA guard for all eight reviewed files. Hash changes intentionally fail CI even for edits that might be harmless; review the complete shader/schedule/sampling contracts and rerun the actual-GPU baseline/R32 matrix before updating a certificate. Do not auto-refresh hashes to make CI green. The numeric tests verify the conditional bound and expose sentinel failure; they do not prove driver conformance.

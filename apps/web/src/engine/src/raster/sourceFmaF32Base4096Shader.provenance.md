# Portable GLSL100 base4096 finite FMA primitive

Inactive component primitive, not a renderer hook or complete auto mask. API `sourceFmaF32Base4096(a,b,c)` accepts canonical finite binary32 components `vec3(negative0or1,significand24,exponent)` and returns `vec4(negative,significand,exponent,class)`, class0 finite /1 overflow. Host caller validates canonical inputs first. Signed zero and subnormal components remain explicit; **no numeric subnormal reconstruction or rawU32-through-float**. No uint, uvec, ES300 or WebGL2 requirement. Actual WebGL1 gate is below; other browsers/devices are unproven.

This is an independently authored significand algorithm reusing the already proven80-bit retention/signed-tail law of `sourceFmaF32Model.ts` / `sourceFmaF32Shader.ts`, replacing its11 byte limbs/88-bit scans with7 twelve-bit limbs and direct limb rounding. No Krita/Qt/ARM source function body was copied. The ARM/native fixtures are independent expected outputs, not an implementation lookup or licensing clearance.

## Exact-integer bounds and rounding

Each significand is split into two base4096 digits. Grade-school2×2 multiplication carries after each term: maximal intermediate is4095²+4095+4095=16777215, exactly representable with WebGL highp23 fraction bits. Normalized limbs remain0..4095. Alignment splits by powers of2 with fixed loop bounds; a shifted digit is at most4095×2048<2^23. Addition/subtraction/carry are integer-exact in the same domain.

The retained window places the larger term's top at79, with84 physical limb bits including carry space. A product has at most48 significant bits and the addend24; at most one can have a discarded tail. The smaller discarded tail cannot cancel the retained leading word. Opposite-sign discarded tails borrow1 before guard/sticky RNE, exactly as the previous80-bit model. Quotient extraction uses limb alignment rather than88 individual bit visits. Underflow/overflow and signed zero follow the same finiteFMA contract. This avoids implicit driverFMA and does not depend on a JS numeric subnormal boundary.

## Actual Samsung evidence

Fixture `fixtures/sourceFmaF32Base4096/samsung.native.json` pins shader SHA `162eb808439fea4e2599df78fd1319647f2ea9b462c233be848ec55e59cb072f`, original expected corpus hashes, receipts, WebGL version/renderer and precision:

-11200 unchanged native CPU FMA cases: all exact.
-1113 physical Samsung FRECPS-derived finiteFMA input cases: all exact.
-WebGL1.0, Adreno650, HIGH_FLOAT precision23/range127, GL0.
-Per-pixel changing cancellation operands on64×64 target, four ABBA trials,64 draws/trial: all4096 output pixels /16384 bytes exact, GL0. This prevents a uniform-only overwrite workload from being called shader throughput.

Observed submit-through-blocking-readPixels spans: priorbyte80 115.1/53.8ms, base4096 38.9/29.1ms. Warmup/drift is visible; these are **primitive-only GPU+IPC waits**, not CPU-only cost, GPU timestamp queries, universal speed ratios, complete mask performance, or app responsiveness. `gl.finish()` returned0–0.9ms here; a preserved earlier4-draw receipt exposed that timing boundary, so the final measurement separately records submit, readPixels wait, and CPU validation. Do not report the0.1ms submit as GPU completion.

Both host reference12bit-limb model and original80bit reference match11200 native expectations; actual GPU source is locked by SHA in the test. Unit tests bind current source and expected corpora to the independent device proof, rather than pretending to execute a GPU on the VPS.

All own child contexts/GL objects closed in finally, original3 tabs preserved,parent3631 foreground, jobs empty, own19236 forward removed. No dependency/runtime resource created. This primitive is a candidate building block for default-auto NEON coverage; scalarF64 supersampling remains a distinct route and no auto author/admission or compositor activation was added.

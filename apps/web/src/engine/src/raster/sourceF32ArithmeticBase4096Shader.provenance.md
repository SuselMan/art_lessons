# Finite component add/multiply, portable GLSL100

Independently written integer mathematics, no copied upstream implementation. Reuses the separately proven base4096 FMA component contract: sign, 24-bit significand, binary exponent; finite input only, result includes overflow class. Signed zero and subnormal values remain components rather than relying on hardware subnormal float execution.

Multiplication uses a 48-bit product in four 12-bit limbs. Each digit multiply plus two carries is at most 2^24−1. Addition aligns to a 32-bit retained window with explicit discarded-tail sign and borrow, then applies guard/sticky round-to-nearest-even. Cancellation cannot remove the retained leading word when an input has a discarded tail: the leading exponents then differ by at least nine bits. These are exact algorithms, not approximate native substitutes.

Actual Samsung SM-T970 Adreno650 WebGL1 highp23 gate: 22,400 outputs (multiply/add operand pairs selected from all 11,200 native FMA corpus inputs), every output bit exact, GL0. Expected values use the existing independent BigInt exact FMA reference: multiply with product-signed zero, add with multiplicand one. This is not an unchanged-native add/multiply fixture claim. The tracked compact receipt pins input corpus and shader SHA; the test checks this binding, not a simulated GPU.

Reproducer and full receipts: ignored fixes-v52/run-f32-arithmetic12.mts --all, f32-arithmetic12-device-result.json, f32-arithmetic12-cleanup.json. Initial 2048-case run compiled in96.6ms, full run reused the same shader and compiled in10.2ms; timings are test instrumentation, not app throughput. All child/context/GL resources closed, original three tabs preserved, own job marker empty and forward removed.

A separate composed default-auto mask candidate using these operators still failed actual fragment compilation after17.843s with empty log, contextLost=false and GL0. Therefore this primitive proves arithmetic only: no whole mask, renderer integration, procedural-brush admission or responsiveness claim. That failed inactive candidate is not imported by production.

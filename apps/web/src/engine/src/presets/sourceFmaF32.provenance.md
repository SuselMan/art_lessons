# Exact finite F32 FMA via numeric expansions

Independently authored arithmetic, no copied upstream implementation. This helper is a standalone alternative to sourceArmFmaF32.ts BigInt reference; it does not change that reference or activate any brush/renderer path.

For finite binary32 operands, their product has at most48significant bits and magnitude between2^-298 and below2^256, all within normal binary64 range. JavaScript binary64 multiplication therefore represents the product exactly. Knuth TwoSum on that product and the third binary32 operand returns an exact two-term expansion: hi is the nearest binary64 sum, lo retains the exact residual. No product underflow, overflow or TwoSum intermediate overflow can occur in this domain.

Binary32 rounding boundaries (including zero/min-subnormal and maximum-finite/infinity) are exactly representable binary64 midpoints. If hi differs from a midpoint, its nearest-rounding residual cannot cross another representable binary64 value; if hi equals it, sign(lo) determines the side. Exact midpoint ties use the target binary32 significand's even parity. This avoids double rounding when a tiny third operand perturbs an otherwise exact midpoint. Signed-zero handling follows the finite RNE FMA value contract; no NaN/Inf inputs, FENV flags or active installed dispatch claim.

Independent tests compare all11200 unchanged native host true-fmaf outputs and1113 physical Samsung FRECPS corpus outputs;2744 exhaustive edge triples and50000 deterministic arbitrary finite triples compare against the existing exact BigInt reference. Inputs are validated before arithmetic; raw outputs preserve signedzero/subnormal/overflow bits. No epsilon, approximate rounding, lookup or BigInt fallback is used.

A Node-only ABBA microbenchmark of112000 operations per trial measured numeric33.3/14.7ms vsBigInt115.6/108.6ms. This is an operator microbenchmark with warm-up/drift, not browser coverage throughput or UI latency. Ignored reproducer result fixes-v52/fma-f32-numeric-perf.json. No device/runtime/resources created by this unit. Binding to coverage callers remains a separate reviewed step with whole native masks and measurement.

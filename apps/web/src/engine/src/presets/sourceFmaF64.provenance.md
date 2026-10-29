# Certified binary64 FMA with a number path

`sourceFmaF64` implements the same finite-input, one-rounding, nearest-even
contract as the independent `sourceFmaF64Reference`. The ordinary-number path
uses Dekker splitting/TwoProduct and Knuth TwoSum error-free transformations,
as documented in [Shewchuk's exact arithmetic work](https://www.cs.cmu.edu/~quake/robust.html).
The midpoint/correction admission and extreme-input fallback are this project's
glue; this is not copied Krita or Bionic executable code.

The fast domain is zero or a nonzero operand magnitude in [2^-400,2^400].
Products, splitter intermediates and sums stay finite, and the finest possible
nonzero product/error grid is 2^-904, above binary64's normal/subnormal boundary.
Thus the error-free transformations do not silently underflow. Their exact
expansion is `rounded + residual + residualError`. Actual next-up/down gaps,
not an epsilon, define asymmetric halfway boundaries around `rounded`. An exact
TwoSum expansion comparison and the rounded significand's low parity bit choose
the correctly rounded result. Outer-neighbour boundaries certify that a one-step
correction suffices; otherwise the integer reference rounds the original inputs.
Zero results and extreme inputs also use that reference. Zero-product addition
and a normal nonzero product plus zero retain their direct IEEE semantics.
Non-numeric/nonfinite operands retain the reference's rejection contract.

This is used in the isolated source auto-geometry and default auto-mask CPU
helpers. No new brush profile, tolerance, source geometry, quantization or dispatch
choice is introduced. Original 42 geometry and 84 mask fixtures remain unchanged
and exact, including 29,916 mask bytes and the scalar/NEON distinctions. This does
not solve Bionic versus browser trigonometry or activate auto author/render paths.

Validation: all512 unchanged original Qt ARM64 FMADD outputs;35,000 deterministic
bounded/wide raw-bit inputs against the independent integer oracle; halfway,
power-of-two, severe cancellation, signed-zero and finite overflow/underflow cases.
A spy confirms ordinary geometry examples avoid BigInt fallback.
No generated expected output from the fast helper replaces a native fixture.

Host Node20 timing (private R52/fma64-normal-benchmark.json):20,000 ordinary
geometry-like operations, warm rounds about3.4–3.8ms versus30–33ms for the integer
reference, with exact same per-input results. This is a primitive host measurement,
not browser/device/whole-brush/frame performance. No binary/runtime/worktree,
GPU object, service, texture or cache is created by this implementation.

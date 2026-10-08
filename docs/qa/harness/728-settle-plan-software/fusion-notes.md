# Native tape grouping and fusion conditions

The original ordered texture writes are part of the model. A float expression
that only rounds at the end is a different algorithm, even if its final result
looks close. The current tape oracle isolates backend execution from source raster
and can serve as a byte gate for each candidate.

1. **Submission grouping, without kernel fusion.** Encode consecutive canonical
quanta into one command encoder, retaining every dispatch, copy, upload and Q8
texture write in its original order. Allocate upload staging and uniform buffers
uniquely until completion. WebGPU execution dependencies between dispatches remain;
no CPU wait is required for a later dispatch that consumes an earlier texture.
The mathematical operation sequence is identical. This removes submits/waits,
not shader arithmetic. It is safe for offline replay; live presentation/ownership
cadence needs a separate gate and must not change by implication.

2. **Independent two-output contacts.** Compute P and C simultaneously from the
same OLD P/C/flow/coverage inputs and write distinct rgba8unorm outputs. Reuse
sample locations and donor fractions. Both outputs remain individually quantized
and no updated P is fed into C. This is independent-output fusion, not temporal
fusion. Root's paired/single gates apply; resource aliasing must fail closed.

3. **Pointwise producer/consumer fusion is conditional.** The consumer must use
only the same-pixel producer value, with no interpolation or neighbouring reads.
An exact canonical quantization operation is required between expressions. Merely
substituting the producer float expression is unsafe. Tie rounding and saturation
must be measured on the target backend before claiming byte equality. If the
intermediate texture is also an observed/retained role, it still has to be written.

4. **Repeated front/diffusion temporal blocking is possible but not yet proven.**
For n stencil steps the dependency halo is the Minkowski sum of their offsets
(front unit stride: Chebyshev radius n; mixed diffusion: sum of each largest axis
reach). A workgroup could load that complete halo, repeat the ORIGINAL steps with
local barriers, quantize after EACH step, and write only its interior. Overlapping
halos are redundant computations from immutable old inputs, so no cross-workgroup
barrier is needed. Missing halo, mixed old/new global reads, dropping Q8 boundaries,
or ignoring clamp/LINEAR/paper/noise sampling changes results. The required halo
and ping-pong storage can exceed workgroup memory; small n is the first bounded
candidate. This is substantially riskier than submission grouping and independent
outputs and should follow those, with intermediate-role/edge fixtures.

No speedup is asserted here. Count submits, waits, dispatches, uploaded bytes and
GPU timer duration separately on the real device. Reduced dispatch count alone
does not establish lower execution time.

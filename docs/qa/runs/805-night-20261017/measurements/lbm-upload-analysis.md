# LBM upload spike: code audit, no additional GPU run

Frozen v7 measured `uploadJsMs` wraps the entire async `candidate.upload` call. For grid256/16, both the three-repeat and five-repeat runs showed a large third-sample upload: 307.8 and 314.6 ms. Their run-to-dependent times were 103.5 and 107.7 ms. Thermal status was 0. The trace does not yet identify the source of the upload stall.

The actual sequence in `webgpu/lbm.ts` is:

1. `validateInput`: validates lengths/seed and scans 1,048,576 RGBA pixels / 3,145,728 color comparisons.
2. `downsample`: allocates four Float32Arrays: colors 1 MiB, wet 256 KiB, paper 256 KiB, populations 2.25 MiB = 3.75 MiB at grid256. At grid128 this is 0.9375 MiB. It visits all 1024² source pixels for either grid, repeatedly accumulates into typed-array elements, normalizes six channels, and initializes nine population values per low-resolution cell.
3. Allocates 32-byte uniform storage plus two views; submits five `queue.writeBuffer` calls, copying 3.75 MiB + 32 bytes at grid256.
4. Awaits `queue.onSubmittedWorkDone()`. The timer therefore also includes this upload's queue completion and any work already ahead of it.

No map/mapAsync or GPUBuffer creation occurs inside upload. Buffers and bind groups are allocated once in `create`. Previous repeat completion was awaited; full-output readback/map/unmap, a 4 MiB CPU copy, and SHA-256 happen between repeats outside their timing windows. They can still cause deferred GC/allocation effects or leave asynchronous housekeeping before the next upload. No strong array ownership leak is demonstrated by this inspection.

## Ranked hypotheses, not conclusions

- CPU reduction/validation or JIT/GC interruption: plausible because upload includes a substantial JS loop and newly allocated typed arrays. Repeated sample3 location is suggestive, but does not establish GC or JIT as the cause.
- `writeBuffer` staging/copy or its queue-completion wait: plausible; current aggregate gives no separation. A warm run has no newly created user GPU buffers, which weakens a simple per-upload GPU allocation explanation.
- Work from readback/unmap or other browser/GPU clients before the upload fence: possible despite the prior output read having completed; completion of the previous read is not proof that all browser/driver housekeeping is finished.
- Thermal throttling: not supported by the observed status/temperature. It is not a substitute for phase measurements.

## Small next measurement

Add response-only profiling timestamps at upload entry, after validation, after downsample, after each of the five writes, and after the existing queue-completion await. Return scalar durations only; preserve operations, buffers, awaits and order. Record all five repetitions including the outlier. Separate full readback map/copy/hash durations between repetitions as well. No additional GPU synchronization is required.

If downsample is responsible, a short worker CPU profile around those five repetitions can distinguish JS/GC from waits. If the queue wait dominates, inspect that specific phase rather than optimizing the CPU loop blindly. Only after localization compare reusable CPU arrays or an alternative upload path. The current measurements alone do not justify attributing the third-sample spike to GPU shader work.

# Exact CPU initial preparation control (macro21)

New `webgpu/macro21-fast-coherent.ts` exports fastCoherentDefinitions,
id `wgsl-macro-coherent-fast-initial`, same three256phase Lite configurations.
Uses actual macro19 createLite, which uses actual coherent create/upload.
Only new option is coherent fourth initializer?:typeof initialIntegerDynamic;
absent option calls old reducer. Fast wrapper injects macro20's
initialIntegerDynamicFast. It owns that hook; external initializer overrides
are rejected. observePacking still forwards normally, and macro19 continues
to own its safe LOCAL dither PACK with fixed packing hash seed0.

No duplicate pair/pack code, altered coefficient, changed streamfield, new
uniform/buffer, extra dispatch or upload timing exclusion. Input validation
still runs before the initializer. Stream preparation still mutates only
newly produced aux.w and hashes its field after the reducer. Thus CPU
state/aux/stationary/summary equivalence must also propagate through field
preparation and ALL GPU upload words, not only initial alpha totals.

Initializer hook test calls a wrapping OLD reducer exactly once per valid
upload, zero times during construction or invalid-size validation; repeated
uploads preserve default shader strings/fieldSHA/upload words and inventory.
Macro21 integration test uses the actual FAST reducer on a mixed opaque/dry
capacity-frozen cell, normal wet cell, last-pixel boundary and nonuniform
paper; pair/PACK source, all upload words, summaries, ψSHA and allocation
counts match actual macro19 old reducer. GPU lifecycle remains base-owned.
Macro20 owner separately validates every returned array/summary against old
reducer across random/adversarial and thirteen actual fixture cases.

This is an exact-preparation optimization hypothesis, not a measured runtime
win: upload also contains input validation, field preprocessing/hash, queue
writes and completion. Removing packedRGBA allocation/normal-cell secondscan
may help CPU/GC but does not remove those other costs. Existing run/totalReady
boundaries must be preserved in paired device measurements. Shader compilation,
GPU time and output equivalence remain actual-device gates; mock tests do not
compile WGSL. No device/service/browser/tempbuild created by author.

Completed CPU gates: initializer hook default/wrapper test PASS; actual
macro21 old/fast-upload integration PASS; scoped strict/noUnused0. Macro20
owner reports3tests PASS including16random and13actual full-array/summary
comparisons, plus edge/frozen/alpha0 cases. Independent source audit found
no blocker: bounded integer scalar sums/rounding, immediately packed dry
words, normal wet cells skip the second pass, frozen cells revisit only wet
pixels, untouched pads/aux.w remain0. No timing claim before paired device A/B.

Read-only timing-boundary audit: current worker starts uploadJsMs before
`await candidate.upload`. Coherent upload performs validateInput →initializer
→buildStream →SHA256(66564vertexbytes) →four4-byte phase-flag writes →state
0.75MiB +aux0.25MiB +stationary4MiB writes →await queue.onSubmittedWorkDone.
Thus uploadJsMs includes CPU validation/reduction/field preparation, async
hashing, JS upload/driver work AND a queue completion wait; it is not a pure
CPU reducer timer or isolated GPU transfer timer. Pipeline compilation/buffer
creation occurred in createMs before this interval. Full pixel/state readback
and hashing follow the compute-ready interval; previous repeat readback is
awaited before next upload. Awaiting the whole queue also covers any preceding
creation writes, so broad wall changes must not be attributed to a particular
component without the planned paired stage instrumentation. This audit adds
no instrumentation, dispatch, timing change or new optimization.

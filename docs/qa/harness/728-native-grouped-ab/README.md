# Native grouped-settle OFF/ON device gate

Frozen runner/adapter code, real full1536 settle fields, single1024 tile/layer/wash.
The model, source options, profile, seed, packed operation tape and pass order are
the same. Only `groupedSettleSubmission` differs. This is not Room integration,
legacy GL parity, source-model tuning or a new physics experiment.

Build from the worktree:

```sh
node docs/qa/harness/728-native-grouped-ab/build.mjs temp/native-grouped-ab /path/to/baked/paper
```

Serve the output directory with its copied paper assets at a trusted HTTPS origin.
The page provides100 and400 buttons. Device root may call:

```js
await window.runGroupedAB({size:400,allowLarge:true})
// Repeat in reversed order to check cache/thermal bias:
await window.runGroupedAB({size:400,allowLarge:true,groupedFirst:true})
// Optional existing authoritative packed tape avoids untimed pointer authoring:
await window.runGroupedAB({size:400,allowLarge:true,tape:capturedStrokeOperations})
```

The default100 workload is a dense zigzag. The400 workload is clean water followed
by pigment in the SAME retained wash. If no tape is supplied, an untimed native
pointer gesture authoring owner records one canonical packed tape. That owner is
destroyed. Sequential OFF then ON owners (or reversed with groupedFirst) BOTH replay the same immutable tape.
The harness does not regenerate dabs/wetness/profile/seed between A/B runs.
400 requires explicit allowLarge and at least4GiB reported memory when the browser
provides it. This is a conservative policy, not VRAM measurement. Do not overlap
this run with another GPU device test or an open heavy scene.

Each timed run includes actual replay CPU work and queue completion after each
packed operation. Separate counters report actual queue.submit counts, submitted
command buffers, submit-call CPU time and encoding CPU time for source, live
composite, settle preparation and settle execution. Counter wrappers change no
uniforms or GPU passes. All setup, pointer authoring, readbacks and SHA256 work are
outside wallMs/replayCpuMs/waitWallMs. Completion wait is not shader GPU time;
encoding/submission CPU wall intervals overlap with replayCpuMs and must not be
added to it. No improvement is asserted before actual hardware A/B results.

After the final canonical operation, compare EVERY byte of the layer, retained
P/C/coverage/dry/solvent roles and all ten working settle roles, with real
dimensions/nonzero counts. First-run bytes remain in CPU memory until second-run comparison;
only hashes, differences and counts are returned. Source/working fields that are
legitimately zero are reported as zero; layer/P/C/coverage must be nonempty.
This is a FINAL boundary gate, not an intermediate-state history gate.
Uncaptured errors, validation error scope and device loss fail the result.

The button result is available in `window.__groupedABResult`; programmatic callers
receive the full bounded result (including the small authoritative packed tape).
`exact` means INTERNAL native OFF/ON equivalence, never WebGL/native hardware
exactness. Save provenance with adapter/device/browser outside the Git repository.
The runner flag remains OFF by default; the harness explicitly enables its second
run. Repeated OFF/ON or reversed-order trials are needed for performance conclusions
because shader/pipeline caches and temperature can bias a single fixed order.

Validation status: build, strict harness TypeScript and lint are checked. The
full1536 SwiftShader100 smoke was stopped after5 minutes without a final capture;
parity/performance remain UNKNOWN, not failed or passed. Software is not a device
substitute. check.mjs now enforces a default300000ms budget (fourth CLI argument
overrides it), logs GROUPAB stages, and saves timeout/failure evidence. Hardware
root owns the next Samsung/Surface sequential run. No device was used by this agent.

For localization only, `runGroupedAB({size:400,allowLarge:true,captureSolvent:true})`
captures solventBase/solventLoad/strokeSolvent at source-before-settle and after
finish for each replay operation. Copies are submitted immediately at each queue
boundary; mapping/hashing follows afterward. Returned solventCheckpoints contain
bounded hashes/dimensions/nonzero and byte differences, not raw arrays. This adds
readback submissions and perturbs timing: use the default captureSolvent=false
for performance. Missing checkpoint/role and any differing byte fail the gate.

To build the SAME runner with only pre-scissor kernels frozen:
`DISPATCH_BASELINE=9d6f41f1 node docs/qa/harness/728-native-grouped-ab/build.mjs temp/native-grouped-ab-old`.
Build current separately, then pass the exact returned packed tape into both
pages. Compare equivalent OFF rows, all retained roles and solvent checkpoints;
this isolates old/new dispatch from grouping. Never suppress solventLoad.

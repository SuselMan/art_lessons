# Exact observed field preload — current source

The existing native worktree is now `agents/728-native-current`, based on root `8a04d78d`; the previous `agents/728-bounded-ui-optin` branch remains intact. No runtime copies or device runs were created for this change.

`wcNative=1&wcAsyncObservedFields=1` is a strict DEV-only opt-in. Before Room runtime readiness, the two exact baseline descriptors (`Canonical waterFront` and `Canonical diffuse`) compile with `createComputePipelineAsync`. The existing factories reuse those same pipeline objects only for baseline sampling, without lazy-climb or static-cache variants. Diagnostic source samplers and caches continue to use their existing factory. No material operators, dispatch order, field allocations, or authoritative history change.

Runtime logs record compiler wall time and both SHA-256 shader digests; the runtime getter exposes ready status and actual factory hit counts. Compilation moves preparation before readiness; it is not evidence of shorter total loading or physical GPU execution.

Verification: five targeted suites, 20 tests pass. Actual hardware proof remains pending allocation. Earlier Surface pressure-only proof is separate and must not be cited as proof for these two new factories.

The historical patch files are drafts. Applied source is authoritative; the current baseline sampler is `undefined`, never the nonexistent `legacy` sampler.

## Parallel admission review

The subsequent local change admits all three independent descriptors concurrently and awaits successful completion of all before warming or readiness. A failed compiler rejects readiness and destroys the device owner; remaining rejected promises are handled by the aggregate. Production does not enter this diagnostic aggregate. Actual runtime tests hold one compiler pending to demonstrate that readiness stays closed, assert all three exact WGSL descriptors, and verify rejection cleanup. No material operators or buffer fields change.

This scheduling change is not covered by the earlier device run. The measured serial compile phase was approximately441 +1390 ms; ideal overlap could save at most441 ms from that phase, but a driver may serialize compilation internally. No measured loading improvement is claimed.

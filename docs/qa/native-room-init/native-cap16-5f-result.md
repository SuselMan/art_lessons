# ONE cap16 result: keep OFF, usefulness unproven

Exact source5f03e890, actual cap16, browser14/A15/existing3 gates passed. Final
GL0, no loss, meaningful purple endpoint, owned cleanup passed. Bounded rAF/FIFO
markers and packed/export evidence were promoted before cleanup. Same-packed
GPU endpoint parity remains OPEN; this is fresh live input, not a paired arm.

Next DOWN→source1063.1 ms, DOWN→canvas publication1071.3 ms. Source admission→
execution1061.2 ms splits into768.7 ms remaining material,270.3 ms publication,
22.2 ms handoff. Remaining198 steps took27.8 ms synchronous CPU entry wall.
Publication took269.9 ms before GL import; actual import took0.3 ms. rAF overlap
has29 gaps,14 above33 ms, maximum266.7 ms. Cap16 did not establish useful next
contact latency; do not try32 blindly or enable16 by default.

Prior material still has310 ordered steps, same count as the historical cap8
capture. Its total step-entry span1344.7 ms versus1614.9 ms historically is not
causal gain: next DOWN occurred at different progress/cadence, source/head differs
and final inputs were not replayed from one fixed tape. Both endpoints are healthy
but hashes differ, which is not by itself a cap quality regression. No hardware
parity or preserved physical appearance is claimed from CPU ordering tests.

## Narrow next hypothesis, not implemented

CanonicalPlanAdapter.runQuantum already submits one ordered encoder per step and
attaches its original queue.onSubmittedWorkDone continuation to release retained
uniforms/resources. Backend.encodeOwnerCommands already increments pendingScopes
and decrements it in that original release callback. These existing owned scopes
can provide asynchronous backpressure without another Promise, callback, fence,
GPU readback or gl.finish.

An OFF experiment could expose the existing pending-scope count and let the
material job yield before its next original step when a fixed small outstanding
scope cap is reached. A read-only guard must preserve source/material order,
step/finish/publication exactly once, and release/cancel/device-loss behavior.
It limits submission burst rather than making GPU computation cheaper; material
wall or source wait may increase. It is a smoothness/queue-pressure hypothesis,
not a guaranteed latency fix, and needs explicit counterbalanced measurement.

Actual timestamp-query support was not recorded by these captures. Existing
wall markers cannot distinguish GPU kernel duration from queue delay/callback
scheduling. Native default FIFO calls work.next directly; it does not add GL
finish to this job. No synthetic timestamp or new GPU timer has been installed.

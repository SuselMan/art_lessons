# Captured author jobs in the existing FIFO

`enqueue(factory)` remains compatible. Its optional second release callback owns
captured data even before generator construction. This is required for bounded
CPU reservations of pointer packets waiting behind an asynchronous source BEGIN;
a queued generator's finally block cannot run if the generator never starts.
No parallel input queue or scheduler is added.

The same FIFO record owns its factory, optional iterator and idempotent retirement.
Normal completion releases the captured data; cancellation releases every queued
record without constructing it and closes suspended work before releasing its data.
Reentrant cancellation during next/factory defers active retirement until execution
returns. Queue/work/wakeup ownership is detached before arbitrary cleanup callbacks.
Explicit cancel attempts all retirements and preserves the first exact error.
Execution/factory/clock failures preserve their primary error through cleanup.
A throwing failure observer cannot strand freshly enqueued next-epoch work.

Tests-first: the original implementation fails four ownership witnesses. On resume,
two additional tests expose a suspended owner stranded by a clock exception before
selection and a fresh job stranded by a throwing failure observer. All nine FIFO
tests pass after the fixes, including normal completion, scheduling failure,
factory/return/release faults, stale callbacks and reentrant cancellation. Twenty
existing engine timing and shared scheduler regressions pass. Scoped lint has no
errors (test generators intentionally lacking yields and injected finally errors
produce warnings). This prerequisite does not enable source pointer authoring or
change room/transport authority. No temporary service/device resource is created.

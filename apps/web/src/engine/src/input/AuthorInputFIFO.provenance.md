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

## Promise parking in the same head (2026-11-01)

An explicit `AuthorInputWait` yields the actual service Promise plus an absolute
`context.now()` deadline and its error. Ordinary void yields retain their existing
step/time budget. Waiting retains the existing head and captured input releases;
MOVE/UP enqueue neither advances that head nor schedules runnable polling turns.
Promise settlement or the single deadline timer accepts one ordinary scheduler
wake. Rejections/deadlines enter the generator through `throw`, preserving its
existing catch/finally retirement. The timer expires at its deadline; an observed
settlement after that deadline also fails. This is scheduling, not admission.

Promise reactions retain a detachable cell, not the canceled job/source. Cancel
clears that cell before arbitrary cleanup, closes suspended work once and releases
all queued captures. Epoch/head/wait identity makes late reactions and accepted
stale wakeups inert. Reentrant timer creation also clears its just-created old
handle. Async failure notification exceptions cannot create unhandled rejected
Promise children; cleanup/scheduling notification is attempted before containment.

Core validation: 18 tests pass, including the original nine, real deferred Promise
ordering/rejection, never-settling deadline, cancellation before/after settlement,
malformed accessor refusal, throwing timer cleanup, reentrant timer setup and
throwing async failure notification with independently owned fresh work.
The coupled FIFO/actual-author/scheduler run passes 74 tests in three files.
Targeted TypeScript with actual app options/shared source passes; scoped lint has
zero errors and 38 warnings (existing style plus intentional generator/fault
witnesses). The final module-scoped outcome observer has a separate four-case
actual BEGIN rerun. These are HOST lifecycle results, not physical GPU/performance
claims. No runtime/device/service
was created. Integration base is commit 231ae7f803d9fe6fe2b4374753c0dcd4c7506711.

## Opt-in same-job material checkpoint

Canonical source producers can yield an own-DATA `author-input-checkpoint` with a lazy void-yielding flush factory. The SAME active FIFO record holds one pending checkpoint/running cut; no second queue, source-result buffer or global turn cache exists. Default void producers and BEGIN wait behavior remain unchanged. At pump end the source's pending cut becomes eligible before any further source work; actual cut execution waits for the next cooperative turn if step/time cap is exhausted. Immediate inputComplete cut precedes return/next input. Two counted yields and the same4ms clock apply to source and cut queue-pressure yields; completed cut housekeeping still consumes CPU time and never resets the clock. A first quantum can overrun cooperatively as before, not a hard walltime guarantee.

A producer resume revokes the prior cut-safe suspension point until another checkpoint, completion or wait is reached. In particular a plain void pressure yield can be an OLDER automatic-overflow chunk awaiting local admission while the adapter already contains NEWER material. The suspended bit prevents the cut factory from overtaking that handoff. The actual ordering witness was RED cut:new before admit:old, then GREEN with this gate. Factory identity cannot change while old pending ownership exists. Wait observation may attach before a cut completes; the existing same-job wait owns the detachable promise cell, while the cut drains first and source cannot resume until both permit it.

Checkpoint descriptor capture invokes no accessors but may run Proxy traps, so epoch is rechecked immediately afterward before any assignment. A real reentrant-cancel witness was RED with missing source.return/release; the postcapture retire guard restores both and permits only fresh epoch work. Invalid descriptors/factory errors, cut.next/return errors, source.return/release errors, cancellation while cut runs/suspends, and late rejected waits attempt every owned cleanup and preserve the first work/cleanup failure. Cut fields/factory/iterator references detach before retirement callbacks. No metadata is emitted by cancellation itself.

Evidence receipts are in R52/source-author-pump-{fifo-red,handoff-order-red,capture-cancel-red,final2-five-suites}.log. Runtime source scheduling and renderer responsiveness still require separate actual-device validation; these are unit/engine ownership proofs.

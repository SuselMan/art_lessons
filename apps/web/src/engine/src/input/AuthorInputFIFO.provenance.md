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

## Material7 remainder coalescing (RAM scheduling unit)

The existing material adapter remains the only pending DRAW owner. Material7
uses an upper bound K8 of actual material yields. The first material of EACH
captured START/MOVE input still flushes immediately; inputComplete, wait, source
completion and END preserve existing ordering. No source query is repeated,
removed or reordered, and no sensor, random stream, saved phase or fence changes.
Legacy producers without a deadline retain pump-cut behavior.

Only the remainder may span cooperative turns: its earliest absolute 32ms
`performance.now()` deadline cannot be extended by later/query-only checkpoints.
K8 also cuts with a frozen clock. The same FIFO two-yield / 4ms turn budget applies
to both source and queue-pressure handoffs; a slow atomic step may overrun it.
32ms is a soft eligibility deadline, not an atomic bound, debounce timer or
promise of larger packets: queue pressure, automatic adapter limits and earlier
query checkpoints can cut sooner. The existing MessageChannel task scheduler is
used; no universal RAF/16ms assumption or measured speed claim follows.

START reserves logical pending metadata on the SAME BrushMipCache before adapter
allocation and BEGIN: 1024 + K*(2*1024+512+512) + 10*128 + 64*256 bytes,
plus 2*K*(2*curve.text.length+32*curve.points.length) for an actual Soft curve.
For material7 K=8 gives base43264 versus old K2 base24832 (+18432). The two
recipe trees cover the generated recipe and adapter structured clone per DRAW;
both carry Soft curve text/points. Existing reusable author/program tables retain
their own charge and are not compiled per input. This is a conservative logical
estimate, not exact JavaScript heap measurement; initial pointer/seed/controller
capture still precedes this existing START reservation. No budget ceiling rises.

A deferred checkpoint retains only the same producer flush capability. Ordinary
void handoff suspends its cut-safe point, preventing newer pending material from
overtaking an older automatic cut. Reentrant clock revocation is checked before
using the checkpoint. Cancel retires the existing iterator/cut/capture and never
flushes revoked pending material; the existing engine cancellation path commits
only its already handed prefix without fabricating END. Existing partial-close
and zero-frame-discard controls remain part of the coupled regression gate.

Tests use recording GL and metadata-derived self-authored synthetic CAS fixtures,
not vendor artwork or a native-pixel proof. The normal engine read/service path
selects material7; no private preview flag is added by the new controls. Baseline
contrast consumes BOTH old production modules through immutable Git and the SAME
normal engine API, not an unsupported new checkpoint shape alone. Every actual
DRAW (expanded recipe, grain included), fence, final source/RNG state and folded
composition controls is compared to flush-every-yield source execution. HOST
results establish scheduling/ownership semantics only. Actual response time,
GPU pixels, network/IDB/outbox dominance and hardware support require later QA.

Final immutable RAM gate V5: SAME-API baseline RED3 (both old production
modules, all semantic/composition comparisons pass before max2-versus-K8 fails),
then 139 tests / 4 existing suites PASS; strict4 roots / 285 source inputs / zero
diagnostics. Configured explicit-path lint: zero errors, 51 baseline warnings
and 54 candidate warnings (+3 intentional empty flush-generator test witnesses).
All processes have PID/argv/TTL receipts, input hashes rechecked, jobs reaped.
The registered disposable lint directory was finished and is absent. No browser,
device, service, runtime build or dependency copy was created.

V1/V2 failures were new fixture errors (missing mandatory decoder frame ordinal,
then asserting a DRAW on the legitimate empty initial fence frame), not evidence
of product failure. V3 new engine controls passed; strict exposed optional deadline
descriptor narrowing in the existing wait parser. V4 uses optional descriptor
value access followed by the unchanged own-DATA/type validation, with no cast or
weakened schema; 139/4 and strict passed. V5 adds packed/decoded composition checks
before RED and reruns full139/4 plus strict. These histories remain in R52.
Base commit: `1e85d8cdb074e8a00c75e082ff9b7d9d8a4cf4e0`. Final evidence: R52/authored-coalescing-v5-*.
This unit does not establish measured responsiveness or authorize QA deployment.

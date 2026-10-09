# Observer-only scheduling proposal

Research helper only; native production source unchanged. Scope cap remains0;
no wake, schedule, new queue ACK, Promise, fence or timing override.

Bind immutable `{fifoEpoch,requestId,ownerEpoch,requestKind}` when FIFO request
is admitted. At actual scheduled resume, call bound `resume(queued)` before
advance, within a diagnostic try/catch. Never derive request identity from the
mutable current queue inside an asynchronous callback.

At runQuantum encoding bind the release recorder with monotonically assigned
owner-local quantumId. In the EXISTING queue.onSubmittedWorkDone fulfilled and
rejected handlers: save pendingBefore, execute original owned.release and
transient cleanup, then record outcome/pendingAfter/live. No extra queue call.
Do not replace encode-error release with a fulfilled ACK: distinguish
`encode-error`, `fulfilled`, `rejected`. Diagnostic exception cannot escape.
`observeAfterOriginal` is optional proof wrapper; do not use it to change existing
cleanup retry/error policy. Original cleanup exception propagates and is not
misreported as successful release.

Cancel marks request recorder cancelled; later release is retained as evidence
with its original epoch/request, never resumes anything. Close only after owned
cleanup when final snapshot is taken. Bound default2048/max8192 rows with explicit
dropped and observerErrors; any dropped rows prohibit complete wait accounting.
Snapshots retain frozen rows. Null observer must perform no diagnostic clock,
allocation or callbacks. Helper validation occurs only during diagnostic setup;
never validate passports on production input callbacks.

Three Node tests PASS: provenance mutation/latecancel/idempotence;
bounded/error/closure; diagnostic exceptions preserve original cleanup result and
original exception. CPU fixture timestamps are not device evidence. Later ONE
cap0 measurement can retain these markers alongside existing pass timestamps;
GPU duration and wall time remain separate quantities.

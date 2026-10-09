# Native scheduling observer: offline implementation

DEV default OFF: `wcNative=1&wcNativeSchedulingObserver=1`. The observer changes
neither FIFO yields, quantum cap (8), scope cap (0), submissions nor publication.
It adds no ACK promise or GPU fence. OFF keeps original release handler identity.

| Marker | Source | Meaning |
| --- | --- | --- |
| requestAdmitted | central request binding | Immutable actual FIFO epoch/id/kind; owner epoch is null because owner creation can be lazy |
| schedulerResume | original generator next/return/throw | Scheduled continuation entry, with original queue count |
| fifoPhase | original central phase markers | Prepare/step/finish and publication start/done; original phase ordering |
| scopeSubmitted | after original queue.submit | Actual encoded executor owner generation plus immutable request identity |
| scopeRelease | existing queue ACK success/error handlers | After original owned/transient cleanup; pending before/after, live and cancellation |
| encode-error | original encoding catch cleanup | Not a fulfilled queue ACK; original error is preserved |

The owner generation comes from the executor's immutable generation at quantum
encoding, not a predicted admission generation or current runtime owner at ACK.
Late cancelled ACK keeps that passport and never wakes a request. Rows are bounded
at 2048, with dropped/error counters; incomplete rows prohibit complete wait
accounting. Clock/diagnostic failures cannot interrupt original cleanup. Original
cleanup errors propagate and are not labeled successful release.

Runtime snapshot is `diagnosticSchedulingSnapshot`. No hardware measurement has
been made with this code. Controller touch/first-source and GL display/rAF markers
remain to be joined in a separately allocated diagnostic scenario. A synthetic
pointer timestamp is not human pen latency; queue ACK is prefix completion plus
callback dispatch, and GL publication is not compositor first visible pixel.

Validation correction: earlier `tsconfig.json` has files[]/references and was not
a full app typecheck. Real checks now use `tsconfig.app.json`; seven test-only
implicit-any annotations were corrected. Existing hardware byte parity evidence
remains actual evidence independent of that earlier typecheck limitation.

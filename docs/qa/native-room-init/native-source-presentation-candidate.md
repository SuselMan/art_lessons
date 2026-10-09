# Native next-stroke candidate, default OFF

Principle: preserve authoritative material ordering; separate provisional visual
feedback from the material transaction. The architecture understanding map was
checked before this proposal. No new model, operation type or reordered log.

The f273 ONE run measured consume→source delay968.6 ms. The new adapter observer
can distinguish preceding material steps from its publication wait using original
callbacks; it is OFF by default. Its CPU tests preserve order, held publication,
original failure and cancellation. It adds no Promise handlers, GPU calls or
fences. Observer overhead can affect the existing4 ms slicing budget, so exact
frame cadence is not claimed. Future interactive source passport includes the
adapter: four critical files plus ten factory/runtime files, fourteen total.

After the bounded attribution proof, the first patch candidate is an isolated
provisional contact overlay, not source mutation ahead of the previous settle:

1. At live CPU delivery, freeze the already prepared drawable geometry, physical
stroke ID, layer ID, generation and reveal rectangle. Draw only that geometry
into a bounded GL preview scratch owned by the stroke. Reuse the existing preview
composition seam; do not call canonical consume again or append another operation.
2. Canonical source/material still enter the original FIFO. Preview cannot read
or write mutable native coverage/ink/base fields. The existing native film and
wet/foreign sampling remain authoritative, so the provisional visual is explicitly
not a second watercolor simulation.
3. Keep the overlay until the matching canonical source publication completes.
Retire by exact stroke/generation/reveal lease, not by UP, queue-empty, timeout or
any unrelated publication. The existing publish completion callback can carry
that acknowledgement without a new Promise handler or fence.
4. Undo/rebuild/layer switch/context loss invalidate the lease synchronously.
Late publication cannot erase a newer stroke's preview or revive old pixels.
A maximum one bounded scratch may be retained; allocation failure disables the
optional preview, without changing canonical material or retrying GPU work.

This aims at visible contact feedback while material is blocked. It does not
speed up the solver and can introduce a preview→material transition; it therefore
needs real user inspection and must remain DEV OFF. An alternative of emitting
actual source ahead of previous settle requires immutable versions of the full
scratch/material fields and consistent merge semantics. The current executor
shares mutable coverage/ink/base slots, so merely moving enqueueSource ahead of
admitFactory is unsafe and is not the proposed patch.

Required proof before showing: same packed final material and operation history
with flag OFF/ON; own publication lease tests (stale/matching/partial/rebuild/loss),
no duplicate delivery, bounded allocation, and actual first/next live contact.
The existing A15 replay equality covers precompile, not this new overlay. No
hardware or overlay implementation has yet been run under this proposal.

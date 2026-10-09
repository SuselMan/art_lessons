# Actual central contract: private-copy overlap пока заблокирован

Current native runtime source unchanged from cfe31021; subsequent HEADs contain report/docs only. Source inspected after standalone64² private-copy PASS. Fresh quota before work: 2026-10-09T20:01:03Z, primary used28%, secondary unavailable.

Exact callgraph:

`Runtime.finish` → `central.admitFactory` → generator.prepare/step → actual Executor.task.finish → `planner.job.finish` (its finally.dispose) → `finish.encode` + owner queue submit → task.publish → Executor.publishWithoutDrain → Bridge.submitCanvas/raw queue.submit → existing ACK → guard/current → GL import → publication promise resolve → central.close/changed/resolve → material generator.done → FIFO.shift → next SOURCE generator.

The earliest GPU-safe candidate remains immediately after the independent raw canvas submit. But the actual host interfaces do not expose a submit token separately from completion:

- RoomNativeMaterialJob.publish returns one Promise<void>, not submitted/completed pair.
- Bridge.copyByCanvas resolves only after existing ACK and GL import; submitCanvas is private and exposes the same completion semantics.
- RoomNativeCentralAdapter.admitFactory waits `while(!ready) yield -1` before close/complete.
- WatercolorCanonicalFIFO.advance executes requests[0] only; it shifts that request only when its generator reports done.
- `central.isIdle` is executing||!fifo.pending. External nextsource emit while old material is head fails the actual Executor guard; manually setting it true would repeat the earlier fake-central assumption.

Thus a real next SOURCE cannot start while old publication remains pending without changing admission semantics: split/detach the pending material head or introduce another lane. Those are the prohibited reorder/architecture changes for this task. No new model test pretends actual central can provide that seam. Existing actual central held-publication tests exercise its opposite contract (later source waits), and are not presented as overlap proof.

Private output copy eliminates output texture overwrite only. Same-owner and all of the following remain necessary for any future proposal: immutable publication GL target/version/lifetime; same scratch/tile/targetLayer/generation; no destructive operation/owner retirement or new GL seed; no moment/foreign source shortcut; old resource close must not affect next source. New owner constructor reads GL baseline, which is stale before old import. Negative overlap owner/cancel/newer-GL/pending-lifetime proof cannot be claimed until a new actual admission contract is explicitly designed.

Result: HOLD at exact interface boundary. No runtime/FIFO/default changes, code/framework/diagnostic added, hardware or benchmark run. Next decision is an explicit submitted/completed publication contract with failclosed ownership/version rules; constructor-only assertions cannot implement overlap.

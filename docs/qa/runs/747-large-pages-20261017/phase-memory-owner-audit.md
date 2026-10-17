# #747: phase-owned shared field memory — read-only proposal

Source audited: `7b91e3023f7f65f34763ce82f598774ef4e4be29`, plus root allocation note `747-phase-allocation-review.txt`. No runtime edits, GPU tests, budget changes or new processes. This is an API/invariant proposal, not an implemented optimisation.

## Observed owners and gap

- `engine/index.ts:1674–1734`: large-page M70 creates its own residency cache120MiB and scratch pool; its `withScratchPool` plan still reaches engine `_diffuseFieldFor` through shared context. The physical page, paper, legacy pool and global phases are not all charged to that120MiB.
- `_diffuseFieldFor`, `index.ts:8942–8967`: engine `_fieldCache` owns10 ordinary non-residency field textures. It clears/reuses them or destroys/replaces them by dimensions. A1536² field is90MiB.
- `WatercolorFrontPaths.ts:95–99`: four prefix buffers plus scratch are allocated outside residency,45MiB at1536². `invalidate()` only clears cached key; `dispose()` also deletes programs. Neither is a texture-only phase-release API today.
- `PagedPuddleRoomController.ts:331–345`: `cancelCurrent` marks layer dirty and calls solver.cancel; `start` installs a generator via resetFromScratch. `solving` is not represented by engine `_settle`.
- `PagedPuddleTarget.ts:47–49`: immutable raw capture and global contrast preparation happen before the first yield. A new source-captured barrier belongs BETWEEN these calls, not after first yield. `:69–95` retains a Native invocation/windowSource/key across generator yields and closes all through nested finally. `cancel/reset/destroy` call generator.return. Lease release must follow completion of those finally blocks.
- Native `PuddleTarget` holds prepared job fields across step calls; `cancel()` disposes job/scratch/capturedWater but does not release engine field/prefix textures. It rejects legacy `_settle` through host.hasActiveSettle; that boolean is not a common lease counter.
- `WatercolorSettlePlan.ts:258–282,721–738,1334–1340`: presentation/contact continuations may retain fields, owned inputs and borrowed scratch beyond one JS step. A job is not quiescent merely because its initiating draw returned.
- `_scheduleFieldRelease`, `index.ts:8731–8743`, checks only legacy `_settle` before destroying fields. `_enforceGpuBudget`, `:8810–8813`, has the same missing paged-owner condition. BOTH must delegate to the new owner. Context-loss/destroy field paths must also invalidate its generation.

There is currently no explicit common lease owner proving that legacy, paged and retained continuations are absent. Do not add a budget increase by checking only `!engine._settle` or `!controller.solving`.

## Logical byte motivation

Root code-derived4×1024² example: live DOWN source/film176MiB, goals16MiB, ROI~5MiB. Thus120MiB residency cannot hold the live minimum. Shared field90MiB plus prefix45MiB may remain allocated despite having no useful pen-time work. Idle-pool discard helps free leases, but does not reduce these live plane requirements.

A phase ledger can reuse approximately the same envelope: input cache224/240MiB + field/prefix0 versus solve cache120MiB + shared field/prefix135MiB. These are candidate caps, not universal byte totals: include mip levels, uncached physical/paper/coarse textures, other legacy fields and driver overhead. Raising to240 after freeing135 from120 increases this subtotal by120, leaving15MiB slack; a lower224 cap leaves31MiB. Neither proves the whole-device budget.

GL deleteTexture/deleteFramebuffer permits deferred reclamation. Logical release-before-admit is necessary but does not prove instantaneous physical memory reuse; native peak/RSS/context-loss measurements remain mandatory.

## Minimal APIs proposed

1. **Engine-level `SharedWatercolorFieldOwner`**, shared by all plans/controllers using `_diffuseFieldFor` and prefix paths:
   - `acquire(kind, revision): Lease` where kind is legacy/paged/rebuild; lease has idempotent release and generation.
   - `activeLeases`, `phase`, `generation`, `transitioning` read-only telemetry.
   - `releaseIdleTextures(): ReleasedBytes` rejects active leases, active draw scopes or a transition; clears field handles and calls prefix texture-only release. Programs, paper, recorded material, raw sources and journal stay intact.
   - Every field allocation/use must occur under the current-generation lease. Whole-job acquisition is simpler and safer than per-window reacquisition initially. A paged lease includes its global phases/continuations until completion or cancellation.
2. **`WatercolorFrontPaths.releaseTextures()`**, distinct from invalidate/dispose/forget: destroy prefix buffers and scratch, set arrays empty/scratch null/key null/extraBytes0, preserve linked build/jump programs and disposed=false. Next ensure recreates fields. Expose through WatercolorPasses. A shader recompilation/context reinitialisation API is not a substitute.
3. **`BufferResidency.trySetBudget(bytes)`** with positive-safe-integer validation and explicit result/reason. The current readonly budget has no resizing API. On shrinking, preflight eligible resident bytes excluding pins, active draw scopes, bound FBO/samplers, and the protected invocation. Evict losslessly before committing the smaller cap. If readback fails midway, keep the previous cap; already-evicted buffers remain valid backed entries. Partial residency change is acceptable, partial material loss or a false successful budget commit is not.
4. **Paged source-captured hook** owned by the phase controller, invoked after successful `capturePagedPuddleSource` and before contrast/field work. It receives immutable revision identity and runs the shrink/admission barrier. Cancellation/error must dispose captured references and release leases in finally. Retry must use the same accepted revision or explicitly restart capture, not silently mix epochs.

Do not expose setters as product UI or automatically enable this proposal. First prove it behind a diagnostic gate.

## Ordered transitions

### Solve → input

At the first local/peer/replay material write that requires the large input working set:

1. Enter an exclusive synchronous transition; reject/requeue reentrant phase requests. Cancel pending field-release timer.
2. Cancel paged job synchronously; generator.return finishes Native/job/windowSource/key finally. Keep its layer dirty and old published goal valid. Complete or cancel legacy through its real queue lifecycle; do not clear `_settle` by assignment.
3. Assert all common leases and active GL draw scopes are zero, no suspended continuation can resume with field references. If not, do not release textures or raise cap.
4. Release only shared field/prefix textures; verify actual logical owner counters now0. Do not use passes.init/forget, plan.destroyTextures or controller.destroy as a generic release: they affect programs, live ownership or inputs.
5. Admit input cap against the whole phase ledger, then allocate/write film/source. On allocation failure, close the gesture/temporary leases safely and preserve accepted material; do not leave the phase marked solving or claim a successful stroke.

Foreign/other-layer input uses the same shared owner. One layer's inactivity does not allow destroying fields leased by another layer. Sequential dirty layers remain queued, not independently allocated full solvers.

### Input → solve

1. Wait until accepted source/film lifecycle permits solving. Capture an immutable CPU raw revision while the input cap is still available; capture failure leaves prior published goal intact and no solve allocations start.
2. Pin only the tiny transition metadata/required currently-read buffers, not every large source plane. Release GL bindings/draw scopes left by capture. Snapshot is CPU-owned; source GPU entries can now be evicted losslessly. They cannot all be destroyed: final scatter reads physical padding from source at `PagedPuddleTarget.ts:113–128`.
3. Shrink residency to solve cap BEFORE allocating field/prefix/global solve work. If eligible bytes cannot fit because a real pin/draw is active, return a bounded deferred result; no field allocation and no busy retry loop. Cancelled request releases snapshot/transition lease.
4. Acquire the solve-generation lease and permit global contrast/Native allocation. Validate source revision again before publication. Allocation/error/cancel releases job-owned temporaries and lease, retains old published outputs, marks dirty for an explicit retry.
5. On completion, retain only valid published material. Mark the lease released AFTER job and presentation finally blocks. Idle release may then delete shared textures; later input may increase cap only through the ordered transition.

The owner generation protects late callbacks/timers: a stale timer/release token cannot delete a new solver's textures or release a newer lease. Context loss invalidates generation, leases and cache backing, cancels generators without trying to read lost pixels, and resets cap/phase bookkeeping coherently for normal rebuild.

## Required failure tests before implementation promotion

- Suspended paged Native job survives both old timer and GPU-budget paths: no deletion while lease held. Legacy suspended job and presentation/contact continuation get the same protection.
- Cancellation at every yield closes finally and drops lease exactly once; cancellation inside a currently-running continuation is deferred until that frame unwinds. No field buffer is destroyed while its GL draw scope is active.
- New pen/peer/other-layer input interrupts paged solve: old published goal remains, dirty flag retained, field/prefix bytes0 precede cap increase, next solve equals independent replay.
- Snapshot capture throws midway; cap remains input cap, no field allocations, previous output unchanged. Source revision changes after capture; stale publication rejected.
- Shrink with pinned/bound buffers cannot commit a smaller cap; retry after release succeeds. readPixels exception after several evictions keeps old cap and valid backed entries. All-pinned condition does not spin.
- Field/prefix allocation failure after successful shrink releases partial textures and lease; next attempt works without permanently inflating cap.
- Timer scheduled in generationN fires after generationN+1 starts: no deletion. Old idempotent release does not decrement a newer lease.
- Two dirty layers, legacy mixed-tool queue, sliced rebuild, synchronous canonical/export/dry request, resize, snapshot replacement and context loss each exercise the same owner. No alternate `_diffuseFieldFor` path bypasses lease admission.
- Prefix texture release preserves programs and recreates exact buffers/key state; no double deletion or stale cached field key.
- Native measurements sample without texture/FBO getters: preDOWN, aftercancel, aftersharedrelease, filmpeak, postUP, postsnapshot, posttrim, field/prefix allocation, Nativepeak and publication. Track cache resident/mips/backings, actual own pool live/free, shared bytes, global/physical/paper textures and immutable CPU pages separately.

No implementation or memory/performance improvement is claimed by this audit.

# External phase-owner core candidate — NOT applied

Base runtime `7b91e302`. This package does not change served sources, shaders, UVs, material parameters or product UI. Budget transitions are OFF by default. Engine adapter integration is a separate required patch owned by the RCA agent; this core alone MUST NOT be promoted as a working phase allocator.

## Patch/API contract

`phase-primitives.patch`, `manifest.json`: new FieldJobLease/M70PhaseOwner; BufferResidency; prefix texture release; Plan autolease; Paged captured-source barrier. External `.ts` copies exist only to run CPU tests; imports are redirected to unchanged project dependencies.

- `M70PhaseOwner(hooks, enabled=false)`, hooks `cancelAll(lost)`, `releaseTextures()`, `setBudget(bytes): {ok:true}|{ok:false,reason:string}`.
- `acquire(parent?)` ALWAYS tracks field leases, even with budget feature OFF. Rejects lost/transitioning/foreign-root overlap. Explicit parent allows a paged whole-job lease to have Native Plan child leases; only active current-generation parents are accepted. Parent release does not discard children.
- `beginInput(): boolean`: disabled/busy=false. Cancel must synchronously finish its finally/release path. If any lease remains, no texture release and no raise occur: keep the previous120MiB slow path. After quiescent texture release, candidate input cap224MiB is requested. No new buffers are allocated by the owner.
- `beginSolveSnapshot(frozenRaw)`: returns `{snapshot,lease}` or null when busy/shrink cannot be admitted. It never captures again. `beginSolve(capture)` is a lower-level convenience; use the snapshot API for retries. Source capture executes before solve120MiB shrink. Failed shrink keeps old cap and no new solver lease.
- `releaseIdleTextures(): boolean` works with budget feature OFF too, preserving ordinary idle lifecycle; rejects active leases or transition. contextLost advances generation before cancellation, clears lease tokens without GL deletion, and prevents stale transition completion. contextRestored resets120MiB and idle state. Late/idempotent release cannot affect a new generation.
- `BufferResidency.trySetBudget`: validates positive safe integer; preflights all required eligible victims before any eviction; excludes pins/draw scopes/bound buffers using existing policy. Commits cap only after eviction success. A readback exception may leave some entries evicted losslessly but keeps the old cap. It does not increase memory when shrinking fails.
- `WatercolorFrontPaths.releaseTextures` / `WatercolorPasses.releaseFrontPathTextures`: remove only five prefix texture/FBO allocations and cached key, preserve programs; repeated release returns0. Owner must prove quiescence before calling.
- `WatercolorSettlePlanContext.acquireFieldLease?(planInstance)`: optional. Public prepare acquires before its existing body and delegates to private `_prepareFieldJob`. Empty/error retires lease. Whole returned job uses depth-aware FieldJobLease scope. A Proxy wraps array-index access, including dynamically inserted children, preserving original function descriptors/tags. Original operation-array identity checks still run against their own unchanged underlying array. Reentrant dispose retires immediately but actual lease release waits until the running quantum unwinds. finish/dispose/error retire exactly once. With no hook, the exact original job object/path is returned.
- `PagedPuddleInspection.sourceCaptured(raw)`: undefined(default unchanged), `{release()}`, or `{defer:true}`. Runs after one immutable capture and BEFORE contrast/field work. Defer yields and breaks the current step even when maxOps=100; at most one admission retry per step. Cancellation clears blocked state and no captured lease is acquired. Successful lease is released in outer finally AFTER Native/window/key finally. `state.admissionBlocked` exposes retry admission to callers. `state.executing` is a read-only getter: reentrant cancel queues generator.return until step unwinds; destroy queues resource teardown; reset during execution rejects before source replacement. A pending cancel prevents the final atomic output publication. Global phases and output atomic publication are unchanged.

## Mandatory engine/controller integration: exact sites

Only TWO runtime field allocation entries were found by whole-engine search:

1. `WatercolorSettlePlan._prepareFieldJob` (was prepare:243) calls ctx.fieldFor. Covered by this patch's optional autolease wrapper once engine ctx hook is installed. Main legacy plan, withScratchPool clone, rebuild and synchronous replay callers all flow through it.
2. `engine._dryWashScratch`, index:8549, directly calls `_diffuseFieldFor`, then `_groupTideOps`:8574. Needs an explicit whole-method field lease/finally, acquired before field allocation and held through synchronous tide + copy-back/composite. Other runtime groupTideOps caller is inside Plan and inherits the Plan lease.

Engine adapter must additionally:

- Instantiate the common owner even when budget feature OFF, install Plan ctx hook, and distinguish the paged plan instance from the main legacy plan. Paged Native child uses explicit active paged parent; unrelated legacy cannot borrow that parent implicitly.
- Wire input admission before new film/material allocations on local/peer/replay/controller.source paths. Busy admission retains the old120 slow path, never clears a live field or fabricates a phase success.
- Wire sourceCaptured to beginSolveSnapshot and retain its parent lease through the Paged generator finally. Do not recapture raw on pinned shrink retries or allocate field/contrast before successful admission.
- Ensure an ENABLED input224→legacy direct field path first shrinks to120 before admitting field90+prefix45; common acquire() is ownership tracking, NOT an automatic budget shrink. This is a hard integration guard.
- Route BOTH `_scheduleFieldRelease` timer:8739 and `_enforceGpuBudget`:8810 through common quiescence/release. Also cover field replacements, context-loss/destroy and late timer generation. Checking only !_settle is insufficient.
- Serialize transition callbacks/rebuild/canonical/export/dry users under the same owner; no raw `_fieldCache=[]` deletion under an active family. Cancelled generators must complete finally before raise.
- Keep shader programs alive; never substitute passes.init/forget/destroy or plan.destroyTextures for field/prefix-only release. Physical source padding is still read at final scatter, so source buffers may evict losslessly, not be blindly destroyed after capture.

Engine/index.ts and PagedPuddleRoomController are intentionally NOT changed by this package. Root/RCA own that external follow-up. Until installed and tested together there is no end-to-end phase feature.

## Validation

`node_modules/.bin/vitest run --config docs/qa/runs/747-large-pages-20261017/phase-candidate/vitest.config.mjs`:32CPU tests PASS. Tests cover disabled budget callbacks plus always-on common leases; ordering; deferred busy/pinned admission; readback failure after partial eviction; generation/context-loss/reentrancy; explicit family child/foreign rejection; dynamically inserted/tagged operations; reentrant cancellation and allocation/operation/finish failure; real prefix program preservation/reallocation; real Paged generator capture-once/one-defer-per-step/cancel-restart; actual Plan public wrapper/default object identity/null/build error.

Strict tsc on the three standalone owner/job/residency primitives:PASS. Transpile syntax validation for every generated source:PASS. Virtual git index at7b91 applies patch with `git apply --cached --check`:PASS. Normal apply-check against current served worktree FAILS ONLY PagedPuddleTarget because root has uncommitted skip/zero work there; do not overwrite it. No PagedSource/support metadata dependency was added.

The complete engine adapter needs its own combined typecheck/failure tests and native memory/pixel proof. MockGL does not demonstrate deferred driver reclamation, real peak RSS, mobile survival, input performance or artistic equality. No automatic production cap increase is authorised by this package.

## Core2 integration contract

The existing controller synchronous `while(!solver.state.done) solver.step(...)` loops MUST inspect `admissionBlocked` and exit/requeue with a bounded pending-material result; repeating these loops on persistent pins would busy-spin. Do not present an old goal as newly canonical. RCA owns this adapter follow-up. `state.executing` permits controller/engine destroy to defer its outer pool/cache/plan teardown to a microtask after the current step finishes; merely deferring solver.destroy is insufficient if the outer wrapper destroys host.pool immediately. Controller frame completion must revalidate captured layer, revision and disposal status after step, because reentrant cancellation can clear solving during the call.

Core2 tests additionally cover public admission state, reentrant cancel/destroy with the family lease still held during callback, and rejected reentrant reset preserving the current source/epoch. Runtime remains untouched.

## Core3 review corrections

Function descriptors do NOT preserve scheduling: WatercolorSettleQueue stores contact/front classes in WeakSets and presentation tokens in a WeakMap keyed by function identity. Every lease wrapper now calls the real `inheritSettleOpTags(source,wrapped)`. Three real Queue tests compare baseline vs wrapper batch boundaries, event order and sync counts for contact/front/presentation; removing ONLY this call makes all three fail (`queue-tag-negative-proof.json`). The older own-string-property test alone was insufficient.

Generation is checked after releaseTextures and context-restored budget callbacks, preventing reentrant context loss from being overwritten with idle state. Parameter-property syntax was removed and unused private helper retired for the project's erasableSyntaxOnly/noUnusedLocals settings.

## Core4 execution admission

FieldLease has optional enter/leave; fieldJobScope brackets prepare and every wrapped quantum with these calls. Common owner state.executing is a depth count distinct from suspended activeLeases. Reentrant legacy operation admission must queue BEFORE trying to drain its executing owner. Direct `_dryWashScratch` wrapper also needs enter/leave in finally. Context-loss generation invalidates stale leave callbacks. Even an early direct release cannot admit new foreign work or release textures until execution leaves. The new depth is ownership telemetry/admission, not a timing benchmark.

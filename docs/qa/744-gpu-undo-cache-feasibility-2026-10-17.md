# #744: GPU-only optional Undo cache — readonly feasibility

Runtime reviewed: integration0be6e667. No implementation, physics/protocol change or GPU allocation was made.

An exact M70 `captureRestingGpu` API does not yet exist. Existing pieces cover part of it:

- `RibbonStrokeScratch.snapshot/restore/freeScratchSnapshot` already clone non-destructive GPU material and dispose it, but the snapshot list has8fields, excluding`inkDry/colorDry`. It also lacks`materialGesture/pigmentInputsKnownZero`; restore resets these flags. It cannot replace CPU capture exactly.
- `spill/spillWork/unspill` cover10source fields and have`bytes/dispose/takeBuffer/releaseBuffer`, but successful spill transfers ownership and clears the active scratch. It cannot be used to capture a checkpoint while DOWN continues painting that scratch.
- `captureRestingCpu/restoreCpu` cover all10fields plus exact flags/scalars, and current`captureUndo/restoreUndo` supply the useful resting/goalReady/pin/closing/valid proof boundaries. They currently read source+goal pixels into RAM.

The smallest plausible GPU version reuses the snapshot copy pattern with the CPU snapshot field/scalar contract: all10fields, both flags, exact goal copy and CPU wet metadata. It owns one detached, single-consume texture bundle; it does not register a third material controller layer. At1024²,10RGBA8source fields plus1goal have a44MiB upper bound, excluding CPU wet arrays and existing live/solver/presentation resources. Actual present fields may be fewer.

This still needs explicit ownership and budgeting. `MaterialResidency` is currently a CPU cache: overwrite/eviction/forget simply drop object references and have no disposer callback. Storing GPU textures there unchanged leaks GL resources. Pool allocations already contribute to `_washGpuBytes`; separate allocations need explicit accounting and must not be double-counted through carried checkpoints. Allocation admission must respect the actual engine GPU budget, not the CPU64MiB cache cap. Failure disables only the optional capture and preserves normal DOWN/replay.

Existing checkpoint disposal is a useful pattern, not a drop-in owner. A GPU cache must atomically invalidate/dispose on context loss, geometry/resize, history proof changes, foreign interaction and Dry; context-loss handles must be forgotten without reuse. Restore must consume or clone the owned fields consistently, never share mutable textures between cache and live input. The ordinary source-capacity2 guard remains unchanged.

Therefore this is a bounded candidate direction, but not safe as a two-line CPU-to-GPU substitution. Keep the flagOFF. Before promotion, prove exact material/goal equality, native next input beforeUP, all invalidations, allocation rejection/failure rollback and physical300MiB-device behavior. No implementation is authorized by this readonly audit.

## Existing CPU cache: one extra computation, still unlocalized

Readonly call graph: capture reads resting source/goal/wet and stores CPU bytes; it does not call solver`start/request`. Cache eviction can require a later journal rehydrate, but does not synchronously compute a goal. Restore releases the old owner and calls`awaken`, which temporarily sets`dirty=true`; the same synchronous restore then writes the saved goal and sets`goalReady=true/dirty=false` before returning. RAF cannot run between those synchronous statements. A queued frame alone therefore does not prove an extra goal computation.

A bounded trace should wrap only3sites: controller`start(layer)` with at most16stacks plus target/gesture/epoch/dirty/ready/closing; controller`restoreUndo` return and before/after flags/cache bytes/undoHits/rehydrate counter; engine`_startRebuildJob` with pending/unsettled/ACK phase. No source/goal readback is needed. The engine cache fast path excludes running rebuild jobs but not already-pending/unsettled layers, so a queued rebuild surviving a successful exact cache restore is one concrete hypothesis to distinguish. It is not a demonstrated bug and no clearing of those queues is proposed without the actual trace.

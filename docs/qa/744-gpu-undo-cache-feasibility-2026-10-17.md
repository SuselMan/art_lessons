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

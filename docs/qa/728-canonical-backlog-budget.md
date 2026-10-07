# #728: bounded canonical backlog experiment

Base f685fe1c. Default OFF: `engine._settleQueue.canonicalBacklogBatchEnabled`.
Principle: cross-device-determinism; Operation Log, commands, material order,
recorded dabs and solver iterations remain unchanged. Scheduling only.

## Observed problem and exact scope

Native product67 ordinary Samsung pigment400 evidence is retained at
`728-pure-water-plan/temp/pure-water-plan/causal-trace/native-product67_1791367801495/report.json`.
Its flags were asyncFinish ON, other scheduling batches OFF. Input task ended
at 8636.7ms; first canonical idle was 76116.6ms, whole idle 84006.9ms.
Canonical requests declined 183→0. Those requests are FIFO entries, not solver
passes: FIFO blocks on each chunk's settle. Queue's legacy backlog callback
reads `_opQueue.length`, excluding canonical requests. At zero legacy backlog
its default scheduler advances one existing callback per animation frame.
The raw capture lacks a per-job operator census; this is not proof that GPU
execution is cheap, or that all 80 seconds are cadence overhead.

## Candidate

Expose a readonly actual canonical request count; preserve legacy consumers.
When opted in, actual canonical backlog positive, no drawing, and last frame
on time, advance up to four existing callbacks with the existing GPU sync
**after every callback, including final/cancel/replacement callbacks**. Stop
at four milliseconds after sync, new drawing, drained backlog, ownership loss,
or changed/completed job. No preview is dropped. Initial capture remains eager.
Dynamic insertion retains array order. Normal drawing/late ticks/default OFF
retain their original policy.

The existing `gl.finish` clock is not independently trustworthy on every GPU.
A single existing callback can exceed four milliseconds, and synchronous final
completion can start an eager successor capture. This experiment bounds the
number of units, not the worst execution time of an indivisible unit.

## CPU proof / remaining gates

31 tests in SettleQueue and CanonicalFIFO pass: unchanged default, canonical
count excluding blocked solver, cap/budget after sync, actual dynamic insertion,
new touch, backlog depletion, final job replacement, cancellation, owned
paused generator cleanup and no later write. Tests use the real Queue lifecycle
with a generator fixture; they do not prove full Engine/GPU lifecycle.
Whole web typecheck is checked separately in retained temp/qa logs.

Before enabling: immutable original tape OFF/ON physical fields and whole RGBA;
actual Samsung native input/tail/newtouch with source and flags fixed; report
sync cost and late-frame cadence. No native FPS or performance win claimed yet.

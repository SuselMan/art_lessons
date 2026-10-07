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

## Actual Samsung evidence (2026-10-07)

Immutable 059809f8 runtime993 tracked SHA exact, inherited seven baked paper
assets separately hashed; own5330/backend4539. All owned targets closed;
Vite1375980 retired after authenticated clients[]/exact cwd/argv checks.

Normal original1396 replay with identical explicit no-GL FIFO waiter behind
real solver (diagnostic only) exercised OFF/ON. 27 meaningful material/solvent/
coverage/whole-RGBA comparisons: changed0/max0. Nonempty purple1,788,475 pixels.
Actual physical counts matched: front252, carryP28, brushPass2596. Timing
including cadence/captures: solver27.85→8.87s, complete28.42→9.61s. ON1500
synchronizations/370 multi-unit ticks/max4; OFF zero/max1. Presentation callbacks
are wall-throttled; total Queue units1516→1506 is not a material-order comparison.
FibresOFF scope here; native current defaults have fibresON.
Raw `temp/canonical-budget/fixed-canonicalBudget_1791370164319/report.json`;
correct flag labels in `fixed-summary.json` supersede copied legacy labels.

Ordinary native pigment400 three-second zigzag plus immediate new touch,
current public async constructor and model defaults, only scheduler flag differs:

| Actual metric | OFF | ON |
| --- | ---: | ---: |
| canonical idle from gesture start |72.14s|28.43s|
| whole idle incl reveal from gesture start |80.01s|36.24s|
| Queue units / ticks |3691 / 3721|3705 / 1068|
| existing sync calls |0|3564|
| max Queue JS / sync JS |3.7ms / 0|2.9ms / 0.9ms|
| active maximum rAF interval |>50ms|>50ms|
| tail maximum rAF interval |250.8ms|234ms|
| tail intervals >100ms |13|24|
| immediate new-touch handler |73.6ms|40.1ms|

Both emitted nine initial stroke chunks with all ACKs, GL0/lostfalse, and
nonempty dry pigment. Four within-arm Dry→Redo RGBA comparisons (initial400
and subsequent100) are exact0 over17,399,680 bytes each. This is an adaptive
native workload, not identical packed payload or a strict causal FPS pair.
Nine actual OFF settle jobs accounted for3691 continuation units; e.g.
591units took9.877s,559 took9.358s,587 took9.802s (~one callback/16.7ms).
This directly demonstrates the cadence floor;183 FIFO requests are not183passes.

**Do not enable by default yet.** Throughput improves substantially but more
>100ms pauses remain, while CPU Queue/sync duration is small. The sync duration
is not an independently measured hardware GPU time. Need attribution outside
Queue (canonical drawing, presentation/compositor, snapshots) and actual GPU
budget verification. Input responsiveness is not complete computation.

Raw native `temp/canonical-budget/native-canonicalNative_1791370664692/report.json`
and `rgba-comparison.json`; authoritative exec79324 EXIT0, own1465/1466 absent.
Earlier missing baked-paper and controller helper/observer install failures
are retained, explicitly INCONCLUSIVE, and owned targets1461/1463/1464 closed.
The corrected observer install/read contract also passed a real Queue smoke test.

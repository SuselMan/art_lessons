# Actual wet transcript — CPU-only, no deferred Engine activation

Constructor-only DEV observer requires diagnosticPointerAdmission; no Room query.
OFF keeps original sample loop/deposit calls/UP clocks, no event objects or extra
clock reads. ON records real _paintStrokeDabs sampleUnderNib batch time and raw
value, drain inputs, actual standing-water dose/pool and second batch deposit
time, start dropPending and actual UP commit time. Original action order retained.
Observer exceptions are isolated and counted; model execution still completes.

Collector cap8192 events (hard65536), overflow counted. Replay refuses dropped
or observer-error transcripts. It uses a bounded captured PaperWetness fork and
recorded explicit times; never swaps global clocks or writes/merges live state.
Each reconstructed sample must be Object.is-exact before quantization.

Actual PointerInput/coalesced events → real Engine watercolor20/100 brush under
mockGL yields exact replayed per-dab hex profile equal Operation.wet; final
Float32 wet/pool rasters and peak equal original model at the same explicit now.
Initial fixture includes committed wet and pending water (so dropPending matters).
Changed sample times and reordered drain fail against the SAME initial fork.
OFF constructor, throwing observer and overflow completeness guards tested.
11 combined CPU tests PASS; final transcript negative checks 2/2 PASS.

Scope: this proves model transcript capture/replay, not GPU pixels, physical
latency, next source admission, old GPU owner immutability or fork→live merge.
Actual Engine admitted watercolor context remains unsupported/HOLD. No device,
frontend, scheduler, brush physics, publication or source preview changes.

## Typed clock recording extension

Actual model clock stages now include admission-touch, wash-join,
checkpoint-wall (Date), sample-batch, deposit-batch, wash-ended, pending-commit.
Each record carries Engine-local ordinal and explicit batch or null; pre-ID DOWN
records honestly carry null strokeId. Final commit keeps the retiring stroke/layer
identity after Engine clears active fields. Dry-at-UP sets -Infinity without a
clock read, so it creates no wash-ended clock record; replay later must preserve
that branch instead of inventing a timestamp. Diagnostic/RAF clocks are excluded.

DOWN anyWetNear/anyWet calls also record exact args/result; independent fork
checks their results against the same initial model. Clock callcount remains one
per original model read: OFF original direct calls retained, ON records values
already read, no extra performance/Date call. Observers remain DEV-only guarded.

Typed CPU cursor snapshots only clock rows, rejects incomplete/errors/dropped,
invalid/gapped/reordered ordinal, wrong stage/batch, duplicate consumption,
unfinished consumption; failure is latched. It is NOT installed as an Engine or
global provider. Actual Engine fixture consumes all its generated stages exactly;
negative stage/order/batch cases fail. No GPU material capture or runtime replay.

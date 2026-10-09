# Admitted wet Engine fork — HOLD, 3 concrete prerequisites

Current f470 transcript proves actual model actions/per-dab profile on an
independent CPU fork. It does not provide a complete `_onStart`/`_onEnd` replay
clock or preserve GPU wash ownership. No additional runtime implementation here.

## Missing actual dependencies

Engine/index.ts currently reads DOWN `performance.now()` at6267 for admission
lease and at6325 for wash join; calls anyWetNear/anyWet and reads live `_wash`
(layer/signature/endedAt/scratch). Checkpoint uses Date.now at6380. UP writes
wash.endedAt from a separate real time at6742. These are NOT in f470 transcript.
SampleUnderNib at6979 and deposit at7021 each have their own batch clocks; UP
commit at6849 is recorded. Diagnostic timing/dwell/RAF scheduling must keep real
clocks and must not consume a model-clock cursor.

`_paperWet` is readonly authoritative model; a cast-and-swap cannot be a safe
seam. PaperWetness fork does not capture layer pixels, foreign-source material,
`_wash.scratch` or canonical source commands. Existing material readset analysis
has seven op0 fields/28MiB at1024 plus later inputs including coverageFilm and
publication original; no GPU snapshot ownership established. Same foreign-source
wash therefore cannot be admitted by an opts/paper-only packet.

## Smallest implementable follow-up (separate reviewed task)

1. Add a **model-only accessor** for sample/drain/deposit/drop/commit and DOWN
   wet queries, defaulting to live PaperWetness. Within an internal CPU replay
   scope it resolves an independent fork. Display/drying/replay/foreign queues
   still use live model. Restore scope in finally; never overwrite or merge live.
2. Add a **typed model-clock cursor**, recording/consuming named stages:
   admission-touch, wash-join, checkpoint-wall, sample-batch, deposit-batch,
   wash-ended and pending-commit. Require exact stage/batch order, counts and
   owner. Unknown/repeated/missing stages fail closed. Keep all scheduler,
   diagnostic, RAF budgets and elapsed interaction clocks real. Extend recording
   first; no global time override and no raw-value substitution for real reads.
3. Extend captured opts/layer/IDs/snap context only after **wash owner guard**:
   capture wash identity/signature/time and prove old scratch generation/readset
   retained immutable through execution. Until that exists reject any open wash,
   settle, foreign live source or changed material. A restricted fresh isolated
   normal20/100 fixture can test model/profile equality, but cannot claim the
   requested SAME foreign-source wash case or GPU equality.

Required meaningful test: actual original handlers + real PointerInput → staged
record; delay and mutate only live paper; actual replay handlers read independent
fork and exact recorded clock inputs; same packed geometry/pressure/IDs and wet
profile; raw metadata retained, not homogenized. Wrong stage/changed owner must
reject. Verify live model untouched by replay, finally restoration on throw and
queue cancellation. This proves CPU model scope only. No source preview, queue
scheduler, live merge or pixels activation without later ownership/UI proof.

Conclusion: prerequisites (especially same foreign-source scratch) exceed the
remaining narrow CPU budget; keep admitted watercolor unsupported. No new device,
frontend, dependency or source implementation was started for this feasibility.

# #680: peer water source lifetime — release gate

2026-10-06. Candidate `f99d43ea`, isolated home port5305. One owned genuine
Vega Chrome, two independent cookie/auth contexts, identical900×650viewports.
This tests shared renderer/server logic, not cross-GPU parity or user performance.

## Result

Release gate **failed**. Native clearwaterA→drypigmentB (`normal:100:0` then
`normal:0:15`, round,size80) reaches identical confirmed operation sequences,
GL0 and idle state on both participants, but A's actual canonical layer remains
empty. B contains pigment. Final exports differ by roughly84k pixels/max154
(depending on native samples); A rejoin restores the pigment with a smaller
remaining tail difference (11983pixels/max10 in the raw-field run).

The full scenario also exercised B undoing its previous own pigment while A's
peer gesture was live, redo, native Dry toolbar and B rejoin. Dry was the same
server-confirmed operation, seq10, on both participants. These network controls
passed; canonical parity did not. Reaching an idle/log barrier must never be
reported as pixel parity.

Dry-paper negative control (B wet pigment15 without priorwater) had matching
sampled canonical tile values and only32decodedRGBApixels/max7 difference,
consistent with a small live/packed-replay discrepancy. This does not explain
or excuse the missing whole pigment stroke in the foreign-water scenario.

## Bounded evidence

Both engines are current (`capturedE===window.__engine`) and not destroyed.
Composite orders match: background+layer1, opacity1. Layer previews are empty.
A's resident layer tiles have sampledRGBA allzero; its remaining replay chunk
has inkLoad0, solventLoad0, inkDry=null, nonzero coverage. Thus the large failure
is below export/composite metadata, not a blank preview shadowing painted tiles.

Before A rejoin, the painter is idle with waterOnlyDepth=1 and diagnosticDepth=1;
B is0/0. After A rejoin both are0/0. A's saved pre-rejoin trace shows:

- first remote `_runSlice`13.5806s→13.5930s pauses during donor auxiliary painting;
- `_startSettle` then sees waterOnlyDepth1/diagnosticDepth1;
- the next real pigment call at13.9012s enters with both global counters still1;
- that call is `normal:0:15`,38dabs,pieceTris256 and completes while counters remain1.

Code explains the abandonment: `RibbonStrokeScratch.live` is currently
`_tiles.size>0`. Foreign import can yield before the recipient/main scratch has
created a tile. `_paintOpOverFrames` queues its unfinished generator under that
empty scratch; `WatercolorSettleQueue.tick/advance` treats it as dead and drops
the job without completing/closing the generator. Its auxiliary `finally`
therefore does not reset shared painter modes. The next pigment invocation
executes as water-only. The trace proves leaked modes and a true pigment entry
under them; direct queue drop/liveness instrumentation is prepared for fix A/B.

The isolated fix owner is the solvent-flux agent: immutable invocation modes,
plus explicit drawing-job liveness and abort/iterator.return cleanup. Ordinary
solver scratch.live semantics must remain intact. No model constants or pigment
parameters need to change for this lifetime fix.

## Artifacts / limitations

Ignored artifacts in this worktree:
`temp/snapshot/two-vega-result/run/` (full scenario),
`temp/snapshot/two-vega-water-raw/run/` (raw census+rejoin),
`temp/snapshot/two-vega-leaktrace/run/` (saved pre-rejoin chronology).
Home mirror additionally retains `temp/two-vega-drycontrol/run/`.
Raw original PNGs and JSON are preserved. Sampled field census is a32px grid,
not a full mass-conservation proof; decoded exportedRGBA comparison is full-frame.

All owned hardware Chrome instances closed in finally. Samsung preflight was
not a two-peer test: its own page timed out before native drawing, then was
closed. Recent bounded logcat had no GPU crash/ANR matches; live user input was
observed and further device interaction stopped. No user tab or feedback draft
was modified. The independent real automatic100 StoredSnapshot gate remains
passed (see680-wet-snapshot.md), and is not invalidated by this separate failure.

## Fix verification —9eb2a6fe

The owned5305mirror was updated to the isolated fix with matching SHA256 for
index.ts, RibbonStrokePainter and WatercolorSettleQueue. The repro explicitly
started a drawing job with `scratch.live=false` and zero recipient tiles; it now
resumes, imports water and produces nonempty canonical pigment. Global painter
modes no longer exist. GL0/no context loss on both contexts throughout.

Full six-phase scenario: clearwater exactRGBA0; initial foreign pigment differed
by10727pixels/max12; pending undo, redo, native sharedDry and B rejoin all became
exactRGBA0. SharedDry was the same confirmedserverseq10 on both participants.
A second gate separated drying from rebuild: waterA→drypigB initial7356/max10;
native sharedDry without undo/rebuild kept the same7356/max10; both ordinary
rejoins/fresh packed-server engines became exactRGBA0 and remained nonempty.
Thus the dropped whole pigment stroke is fixed; a smaller initial native/packed
source discrepancy remains. Drying alone does not remove that discrepancy.

Before reload, both synthetic stroke payloads and actual native painter inputs
were preserved. Each gesture had97unique native dabs and97packed dabs, split59+38
at the existing1100px spatialchunk boundary. Every packed dab exactly matches
Float32(native) over the10codecfields; no missing/extra dab. Maximum rounding:
x6.1e-5px,size1.85e-6,pressure1.19e-8,t2.44e-5ms. These measurements do not establish
numericrounding as the cause of the residual. Single spatialchunk and live-film
versus encoded-chunk transition auditing are the next discriminating controls.

Fix artifacts: ignored `temp/snapshot/two-vega-fixed-final/run/`, including full
pre-reload synthetic inputs, sourceflags, canonicalPNG and packing-comparison.
Home retains `temp/two-vega-fix-minimal/` and `temp/two-vega-fix-full/`. All owned
Chrome instances closed in finally; no Samsung interaction in fix QA.

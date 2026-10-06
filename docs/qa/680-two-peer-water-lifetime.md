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

## Short controls and remaining technical work

A native short path stayed within one spatialchunk: water36dabs, pigment31dabs,
one operation each. Initial peer canonicalRGBA and A rejoin were both exact0,
GL0. This is a valid control and narrows the remaining issue to the long path,
its chunk transitions, or correlated geometry/state.

A long-path Float32-input diagnostic still differed (13810pixels/max10), but
this control is **invalid for isolating rounding**: copied painter dabs become
keys in scratch.standing, whereas the engine samples that map with the original
Dab objects. Without a clone→original key remap, PaperWetness may take its
fallback. The rounding-cause conclusion is withdrawn. Numeric codec comparison
above remains valid; GPU rounding causality is not established.

CPU path audit: native `_flushStrokeChunk` records the chunk, finishes/settles its
scratch, then calls newFilm; normal replay also finishes/settles each operation
and calls newFilm. Auxiliary foreign-water import instead paints the original
chunks water-only, then releaseFilm/newFilm without a settle. newFilm preserves
lastKept/water/pigment clocks and increments gesture; it resets brushTravel.
SolventFilm saves solventLoad as base, MAXes within one film and adds/caps across
films. The settle reads the solvent field but does not currently transport or
write back solventLoad; it does modify coverage. Therefore aux-versus-native
settling may explain a coverage difference, but cannot simply be assumed to
explain different V delivery. No physical order or constants were changed.

Next bounded causal instrumentation should compare, for the same recorded pair,
P/C/V/coverage at four boundaries: before first pigment-chunk settle, after it,
first delivery of the second chunk, and final settle. Also capture gesture,
lastKept, clocks, foreignImportedGestures and finish bounds/radius. Full server
operation payloads should be JSON-stringified/cloned inside the page before the
bridge's cycle-safe serializer (shared color array references otherwise become
`[cycle]` on later chunks). No corrupted report payload is a replay oracle.

A donor-only chunk-layout control and pigment-only chunk-layout control must be
separate, with measured V/depth budgets: changing a film boundary can change
additive V, so merely disabling chunking is not a matched-input proof. A repaired
Float32 diagnostic must preserve standingMap identity and show matching returned
standing/PaperWetness before its residual can be attributed to geometry rather
than input semantics. These are further technical QA tasks, not a silent model
change required by the confirmed9eb lifetime correction.

## Repaired Float32 painter-input control

The follow-up kept the model/operations unchanged and remapped returned standing
keys from copied dabs back to the original Dab objects at generator completion.
Actual top-level traces on both participants showed97retained original dabs,
97successful standing lookups, zero missing/unexpected keys. Full synthetic
operation payloads were cloned inside the page, preserving color arrays.

Long native baseline:13846differentRGBApixels/max10; repaired Float32 painter
input:9613/max14. A rejoin left each corresponding residual unchanged; allGL0.
Thus Float32 rounding of the painter inputs alone does not remove the long-chunk
residual. This does not isolate earlier native geometry/bounds preparation or
other inputs, and does not justify a blanket claim that all numeric differences
are irrelevant. Sampled canonical/P/C/V fields and original PNGs are retained in
home `temp/two-long-correct/`; all owned Chrome instances closed in finally.

## Packed synchronous versus queued chunk oracle

Genuine Vega, frozen9eb2a6fe (three source SHA checks passed), one owned Chrome
with independent authenticated Room contexts. This diagnostic replayed synthetic
packed operations into fresh actual Room engines; it is not native-input or
server-ACK QA. Source/model/operator parameters were unchanged. Source fixture
came from the repaired long-control report's in-page JSON clones. Codec1, color
arrays, unique operation IDs and wet-string lengths were validated. A common
operation-timestamp epoch preserved relative differences; encoded dab inputs
were retained. Short variants take the first36packed dabs as explicit lower-dose
fixtures, not as identical water volume to the long variants.

The synchronous route actually called `_paintDabs` for every operation, with
suspendDepth1, no `_paintOpOverFrames`, no pending settle or queued operations.
The queued route called `_paintOpOverFrames` once per operation, with depth0 and
pending settle after append. Each operation drained before the next. Both routes
awaited paperReady, used the same review flags (combined/shared fluid/separate V,
foreign V/bottomless/fluid landing) and kept the source frozen.

All four final **whole PNG decoded RGBA** comparisons were exact0pixels/max0:
long donor/short pigment (3ops), short donor/long pigment (3ops), long/long
(4ops), short/short (2ops). All GL0; Chrome closed in finally, exit0.

Exact SHA-256 over every byte of bounded256×128 ROI (x1006,y894) matched at all
corresponding delivery-after/before-finish/aux-water-after boundaries. Matched
boundary counts8/7/10/5 respectively. Coverage, source P/depth/color, V load,
foreign V and film/base buffers were included; finish context and clocks also
recorded. SHA equality is restricted to this ROI, not a full-field mass claim.
Queued after-finish-return still has unfinished work, so it was deliberately
not compared against the synchronous after-finish-return as the same stage.

This is a strong negative for asynchronous queue scheduling as the explanation
of the remaining **native** long-stroke residual under these packed fixtures.
It does not prove native donor state equals auxiliary reconstruction: native
input, pre-painter geometry/fieldWet/clocks, actual native chunk settlement and
packed input remain separate boundaries for the next oracle. No physical fix
was chosen from this negative result.

An earlier attempted fixture used a corrupt historical report with `[cycle]`
in a second-chunk color; it failed before results and closed its Chrome. That
attempt is excluded, not evidence of a source/GL failure. Valid artifacts are
home night-QA `temp/chunk-packed/report.json`, `png-comparison.json` and eight
PNG files; local exact-ROI comparison is
`temp/snapshot/chunk-packed-boundary-comparison.json`.

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

### ROI readback correction; native boundary attempt incomplete

CPU inspection after the following native diagnostic exposed a coordinate error
in both bounded-ROI probes: world y is top-origin, whereas `readPixels` is
bottom-origin. The raster shaders explicitly flip clip.y. The probes had read
world-local y directly, so their purported paint-region P/V/coverage sums were
zero. **The preceding meaningful exact-ROI/source invariance claim is
withdrawn.** SHA equality of an empty incorrectly positioned region does not
establish paint-region equivalence. The four independent decoded whole-PNG
exact0 comparisons remain valid; their exports used the ordinary engine path.
The temp probes now map y to buffer.height minus world-local ROI bottom and
record a nonzero guard; they have not been rerun on GPU.

Native long-donor/short-pigment produced actual distinct participants, water and
pigment gestures, matching server barriers, and saved before-finish contexts.
PaperReady was resolved and paper/wet textures valid; both captured GL0 and
contextLostfalse. Native/packed pigment clocks were12.617825460970478 versus
12.617827662465618; finish bounds differed by small double precision amounts,
while radius36.052520751953125 and landedWet/wetPeak .9333333333333333 agreed.
These metadata differences are observations, not a proven cause of residual.

A ordinary whole PNG exported with33852dark pixels; B export timed out after
120000ms before a final pair/rejoin could be saved. The owned browser closed
in finally at02:13:22UTC; no second fixture ran. Home available memory during
this attempt was482–537MiB with full511MiB swap. That is a resource confound,
not a demonstrated cause of the timeout or source bug. GL status is proven
only at the saved pre-export capture, not after timeout.

Each diagnostic read was bounded to its ROI, not full-tile-read/crop. However
many capture buffers and asynchronous SHA promises can perturb workload; this
is diagnostic instrumentation, not smoothness QA. Future captures should use
only P/C/V/coverage at a few explicit boundaries and enforce nonzero paint ROI
before interpreting exact hashes. No physics or application source changed.

## Corrected painted-ROI native boundary diagnostic

The minimal follow-up used one actual two-auth Room on genuine Vega/source9eb,
long native clear-water A then long dry-pigment B. No whole-canvas export was
called. It read256×128 ROI at world(1006,894), mapping top-origin world y to
bottom-origin FBO y and reversing rows for its raw canonical layer PNG. CPU
validation compiled all20 embedded browser commands. An earlier syntax-error
attempt is excluded and archived separately; both owned browsers closed.

All meaningful ROI guards passed for both peers before rejoin: coverage and V
were nonzero after water, and P/coverage/V plus raw canonical layer pixels were
nonzero after pigment. Five scratch buffers were read only within correctly
clipped tile fragments (18×128 on tilex0,238×128 on tilex1024), with SHA-256
computed over every byte. GL0/contextLostfalse at these captures. The actual
native/packed raw canonical ROI differed10703pixels/max10, while ordinary A
rejoin's raw ROI was nonempty and exact0 versus original A. No whole-image
comparison is claimed here.

The child stopped at its rejoin ephemeral guard: replay had already completed
before the newly installed probe, so there were no diagnostic captures and
P/coverage/V flags were false. This is **missing ephemeral observations**, not
missing canonical paint: the raw rejoin PNG was nonempty and matched originalA.
The parent closed Chrome in finally at02:45:00.793UTC. This is a partial
functional diagnostic, not a full scenario PASS.

Valid stage observations within this painted ROI:

- native clear-water versus packed donor and auxiliary reconstruction had
  identical V SHA at both chunk boundaries; tiny coverage differences were
  already present (first boundary channel sum differed by1code);
- first pigment before-finish P/C/V SHA matched, with a tiny coverage difference;
- by the second pigment invocation, P/C records had materially diverged while
  profiles matched; second-finish right-tile ROI P.b sums were16514packed and
  24242native. Clock differences were small doubles, not a demonstrated cause.

The chronology identifies an ordering boundary that earlier instrumentation
had obscured: `_startSettle` is used both for drawing work and actual solver
work. A's first after-complete callback was drawing completion, not solver
completion. `_finishRibbonStroke(scratch,true,false)` on the author is also
asynchronous because reveal=true, despite fade=false.

NativeB first chunk returned pending at13184.7ms, began second delivery at
13202.4ms, and reached second before-finish at13518.9ms; the first solver
completion was13547.6ms. PackedA first chunk drawing completed15101.1ms, its
solver completed16093.8ms, and second delivery began16136.8ms. Times are local
per-page clocks; only relative ordering within each page is compared.

Thus native second delivery uses a still-unsettled first chunk, whereas packed
second delivery uses its settled result. `WatercolorSettlePlan.finish` later
updates the running second film's base and rebuilds load/color (runningFilm
branch), but does not replay the earlier second delivery against that new base.
This is a concrete temporal boundary, **not yet causal proof** that it explains
all residual or a demonstrated buffer-alias error. A minimal future diagnostic
can force completion immediately after native chunk flush, without changing
physics constants/source, and compare the guarded first/second fields and raw
ROI. No such GPU ablation was run in this check.

Artifacts: home `temp/two-native-boundary-minimal/long-donor-long-pigment/`;
local `temp/snapshot/native-boundary-minimal-report.json`, stage/entry comparisons.

## Scoped forced-first-settle native control

One subsequent real two-auth native Room on the same frozen9ebsource added only
a diagnostic browser wrapper to `_flushStrokeChunk`. After the original native
function returned, the wrapper called `_completeSettle` only for an actual
`normal:0:15` watercolor native chunk with dabs flushed and a settle owned by
that native scratch. It did not modify the application, source operators,
physics constants, encoded operations or the remote painter. All21 embedded
browser commands compiled in CPU before the run. Watchdog120s/finally applied.

The native pigment author invoked that wrapper once after a59dab chunk;
first-settle completion returned pendingfalse/queue0 before subsequent delivery.
The remote participant and native pure-water brush invoked it zero times. Both
peers had the **same four-operation journal inside this run**, independently
verified from their deep JSON-cloned operations. Previous natural baseline is
a reference, not a strict matched OFF/ON input: native rAF sampling and random
stroke seeds can differ between separate runs.

Meaningful painted-ROI guards passed: coverage/V nonzero for pure water,
P/coverage/V and raw canonical pixels nonzero for pigment. Correctly clipped
five-buffer ROI reads used the fixed top-to-bottom coordinate conversion.
Both pigment chunks' before-finish P/C/V/coverage SHA matched exactly between
native and packed peer (10valid field ROIs each). Raw canonical ROI decoded
RGBA was exact0pixels/max0 after pigment and after ordinary A rejoin. All
capturedGL0/lostfalse. Native donor V also matched auxiliary reconstruction;
remaining tiny donor coverage quantization differences of1–3summed codes did
not prevent the matched pigment fields or canonical ROI in this run.

At rejoin, completed replay had no newly instrumented ephemeral captures; its
canonical raw ROI remained nonempty and exact. The corrected diagnostic treats
that as missing source-stage observation, not missing pigment, and checks only
raw canonical pixels for that phase. All three scoped barriers completed;
Chrome closed in finally, exit0. Artifact directory:
`temp/two-native-boundary-force/long-donor-long-pigment/` in the home QA mirror.
Local source comparisons are `temp/snapshot/native-boundary-force-*.json`.

This provides strong scoped support for the temporal-overlap hypothesis:
completing the author's first chunk before second delivery restored native/peer
field and ROI parity despite retained small input precision differences. It is
not a full-image or cross-GPU proof, a controlled same-input OFF/ON proof across
runs, or a production fix. Forced synchronous completion may create a hitch;
this diagnostic is not a smoothness/performance recommendation. The running
film merge preserves new paint, but second delivery against an unsettled base
and later first-result merging are not shown to commute with delivering the
second chunk against an already settled base.


### Passive deferred-stitch identity proof (9eb2a6fe)

One owned Vega Chrome, two authenticated actual Room participants, native clear-water then long dry-pigment gesture. Engine source unchanged. The harness wraps existing calls and reads JavaScript buffer/FBO/texture identities only; no additional GL queries or readbacks. Both journals were deep-cloned inside the page and exactly equal. Owned Chrome closed in finally, process exit 0.

On native pigment job 3, prepare captured gesture 1 at 12585.8 ms with all four tile entries on filmGesture 1. Deferred stitch ran at 12623.0 ms after two entries had advanced to filmGesture 2. Its settled-input fallback selected current inkLoad: deposit and settled inputs referenced identical buffers/FBOs (88/89 and 148/149). On the packed peer for the same journal, job 3 stitch retained filmGesture 1 and selected distinct inkBase inputs on all four entries. The same crossing occurred in native clear-water job 1. Object IDs are page-local; milliseconds establish ordering within each page, not cross-page latency.

This proves the deferred stitch reads a later mutable film and changes its base selection. It does not measure pixel values, mass, performance, or establish a complete repair. Earlier force-complete scoped ROI evidence independently supports the ordering boundary. A proposed repair must freeze the first operation's inputs before later-film writes, preserve resource lifetime through cancel/context loss, and separately prove running-film rebase equivalence. Capturing texture references alone is insufficient because those textures remain mutable.

Evidence: `temp/snapshot/stitch-passive-report.json`; harness `temp/snapshot/deferred-stitch-passive.js`, `two-peers-stitch-passive.mjs`, and `vega-stitch-passive.mjs`. Event streams did not hit their cap (1937/1499). No source change or additional GPU run was made.


### Planned matched hardware gate: grouped first operation (hardware pending)

Candidate `6c121f56` restores the existing Queue.start contract: flow upload, foreign upload and stitch form one immediate first operation. Settle source SHA256: `0a0a9aad59e0d0cce2b440b287a6d98adfe11d8f63b7def864bc9358e75dfd27`. No hardware result is claimed here. Root reported full engine suite/type/lint/maps passing; that is distinct from the pending device gate.

Deterministic canonical control uses the existing 65-dab fixture from `680-settle-idle-grace/temp/idle-batch/fixedFixture.js`: same geometry, pressure, times, preset, color, IDs, production flags and idleBatch=false. Its canonicalProbe measures actual nonzero scratch P/C/V/dry/coverage hashes and full exported PNG. Compare candidate with a source-matched baseline differing only in grouped capture; prior idle/blit results are reference evidence, not automatically a matched first-op AB.

Actual native control uses two authenticated participants, clear-water then long dry-pigment gesture. Passive first-op instrumentation observes all existing copies/resamples rather than parsing function source. Require capture executed before newFilm and next-film writes, distinct first load/base where required, same actual journals at drain, nonempty canonical ROI, native/peer/rejoin comparisons with residuals explicitly reported. No extra GL reads in chronology instrumentation; pixel gates are separate bounded readbacks. Frame/rAF observations are separate from field readback diagnostics. One owned Chrome, outer watchdog180s, finally-close; no user tabs or frozen5308 source changes.

S2 cancel/destroy orphan is separate known CPU lifetime scope and must not be presented as an ordinary undo leak: ordinary undo completes the settle first. Grouped capture changes scheduling, not transport, source doses or material encoding.

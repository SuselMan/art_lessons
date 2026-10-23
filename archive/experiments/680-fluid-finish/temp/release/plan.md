# #468 / #314 §3, §11: two-participant watercolor QA

Target is root's isolated 680-watercolor-release stack. The accepted user5301
and its room are immutable. No GPU/browser was launched for this preparation.
Always save exact source HEAD + constructor flags + independent identities +
GPU/timeOrigin/visibility, before any result. A real Vega/device test is required;
VPS SwiftShader is not a substitute. One real GPU QA owner at a time, granted by root.

## Existing harness audit

- devices/multitest: real rAF native pointer + author operations; useful stress.
  48×48 averages and fixed8s sleep can miss ring/tile errors or pendingsettle.
  Whole-page sampling reads every residenttile synchronously: keep outsideperf.
- pageLib.stroke: changes releasePointerCapture without restoring it; our probe
  saves/restores the real engine canvas method on dispose. Existing frame counts
  are useful, but cannot establish peer pen-to-ink latency.
- comparenow: samples onlyresidenttiles; absent/unspilled tiles must not pass as
  empty. For parity use public canonical export(false) +pixel diff afteridle.
- watercolorParity: forces _completeSettle synchronously; useful fixedlog crossGPU
  oracle, invalid for responsiveness/queuedundo. Uses96ROI, not fullpage.
- collaborationMatrix: real distinctcontexts +undo/redo +13×13pickColor. Excellent
  general regression; watercolor-specific states/ownforeign/pendingoverlap absent.
- snapshot.spec: actually crosses100opboundary and waits authenticated index200;
  freshjoin+reload alone does not prove checkpoint restore. Reuse this pattern.
- reconnect.spec: transportcut/offline+tail rejoin. Real network scenario; adapt
  one small watercolor case, preserve the existing transport intercept helper.

## Prepared runnable probe

Files in 680-fluid-finish/temp/release: page-probe.js and two-peers.mjs.
Syntax checks PASS. CPU preparation only; no claims of executed browser success.

Run after root owns a freshroom and two OWNED visible device pages:
WC_RELEASE_ROOT=<isolatedroot> DEVBRIDGE_PORT=<port> WC_QA_HEAD=<HEAD>
node two-peers.mjs <freshroom> A=<Vega bridgeID> B=<Samsung bridgeID>

Do not use two inactive tabs of one Chrome for frameperf: documenthidden throttles.
Separate device pages are preferred. For twoheaded contexts on oneGPU, log both
visibility and run parity separately fromperf; don't treat secondary frozen rAF
as engine latency. No browser/stack creation by this script, no tokens printed.

Stages:
1. Distinctparticipant/user IDs, identicalflagsets, sameactivelayer, liveGL.
2. A clearwater normal:100:0; B pigment dry normal:0:15 over same screenpath.
   Recordedops naturally have differentauthors/washids; verify that they really
   selected foreignimport rather than trusting a fixture's label.
3. A wetcolored stroke while B waits for realpeerLive/settle/queue, then B undoes
   its own priorpigment (NOT the new A stroke). Required overlap must be OBSERVED, or fail/unverified.
4. B redo, actualnative WatercolorDryButton click→RoomdispatchOp, then assert
   exactlyone new paper_dry ID withknownserverSeq matchingbothclients.
   Directengineappend does broadcast via _onLocalOperation/outbox, but bypasses
   UIrights/islandgate and is not used for this native UI verification.
5. B actualdevnavigation rejoin withsameidentity, reinstalledprobe, comparison.
6. Snapshotindex recorded;204 means snapshot nottested, never success.

Barrier: engineidle3rAF, contextnotlost, queuedpending0, same confirmedentry IDs,
state and serverseq. getOperations is done-only and includesqueuedop whilepending;
probe also records _log.entries pending/state/serverSeq to avoid false convergence.
After checkpointjoin, absence of historicalserverSeq may be legitimate; compare
coveredprefix using snapshot metadata, don't relabel missinghistory as success.

Probe records incomingpeer packets, append/confirm/localemission/undo/redo,
realpendingoverlap, rAFgap p95/max/>33/>100, longtasks, existing liveLatency.stats.
No GLread/export during active measurement. CanonicalPNG onlyafteridle, sameGPU
RGBAexact where justified; crossGPU report max, changedpixels and >8/>24 separately.
The driver writes PNGs but does not claim equality from PNGencoded hashes alone.
Decode to RGBA and examine bounded contentROI/tile-boundary ROI. Preserve PNGs.

## Required follow-up before release

- Real storedsnapshot:100 cheap ordinarypointer operations aftersharedpaperdry;
  authenticated /snapshots/index status200+layers>0, then B rejoin. Instrument
  restoreLayerFromSnapshot and actualblobrequests. Compare canonicalbefore/after,
  requestedcheckpointseq andtailIDs. Don't force an internalcheckpoint and call
  it serverrestore. This stage is intentionally NOT claimed by preparedsmallrun.
- Own-water control (Awater→Apig) vsforeign-water (Awater→Bpig): actual distinct
  strokeIDs andcorrectwater:pigment ordering; logs/flags+borrowedVpresence, no
  exactvisual equality unless actualdose/seedgeometry also match.
- Genuineoffline reconnect: use e2e/support/network interruptTransport, B offline,
  A drawsone smallwetstroke, B returnstail; pendingoutbox andseqend verified.
- Separate practicalperf baseline size80/120 normal100:15 +densezigzag; then
  boundedstress size200/400 onlyafterfirstpasses. Reset existinglatencymeter.
  p95peer pen-to-ink≤200ms withclockuncertainty shown; null/count0 is unmeasured.
  Any >100ms frame needsinvestigation; don't claimdigitizerlatency or GPUtime from
  JS drawsubmission. Record memorybefore/after and context/timeOrigin changes.
- Responsiveness: pan/zoom/toolchange viaactualUI whilepeer settles, firstresponse
  timestamp +nextframe; no forced _completeSettle duringmeasurement. No usertabs.
- Undo/redo while nativeownstroke open, peerpending, rebuildpending each separate;
  verify targetOpId/author (no layerundo accidental), canonical+rejoin aftereach.

Finally dispose probe wrappers/observers and restore canvascapturemethods; close
only owned QA tabs, restore anydevicepower changes, stop onlyknown stackPIDs.

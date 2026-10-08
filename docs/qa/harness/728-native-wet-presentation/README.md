# Tiny actual wet renderer gate

`runCapturedTape(originalTape,{wetSnapshots:true})` adds readonly128×128 crop capture after each water/pigment stroke, worldorigin448,480. Captures actual material RGBA, coverage channels, prepared CPU wetOverlay, clock and worldrect. Physical passes, production1536 extent and source input are unchanged. Then each snapshot is rendered sequentially by actual PAPER_COMPOSE_FRAG and CanonicalPaperPresentation intoRGBA8; same immutable material/map/paper inputs, independent dry andwet readbacks. No physics, no fake pigment/clock, no wetmap substitution for solvercoverage.

Result.wetPresentation includes numerical comparison, hashes, sampler/world metadata and PNGs: nativeDry/nativeWet/glDry/glWet, materialAlpha, coverageR/G/B/A and rawwetOverlayR/G/A. `save.mjs` in captured-tape harness saves step-prefixed PNGs. Only128crop andsmalloverlay bytes are added, not full transient field archives.

Software renderer-only fixed RGBA fixture, actual baked Fine paper: dry0differences/wet0differences; wet effect33200changedbytes/max15 in BOTH renderers; GPUerrors[]/GLerror0. This proves the shared-input display formula/orientation on software, not the captured physical footprint or hardware parity. Fixed-input result accompanies this module. Root owns Surface captured-tape execution; Samsung was not touched.

## Second centre-tap input fixture

The same captured-tape build exposes:

1. `await window.prepareCentrePointerFixture()` mounts a640CSSpx canvas, actual sceneFactory PointerInput/DabSystem, size100/water100/pigment0/round. It returns client coordinates waterStart/world256,512; waterEnd/world768,512; pigmentCentre/world512,512.
2. Root sends real CDP pen events along the returned waterStart→waterEnd. Call `await window.drainCentrePointerFixture()` after pen-up.
3. `window.setCentreFixturePigment(100)` changes actual settings, without clicking a slider or moving coordinates. Send pen-down/up at returned pigmentCentre. Drain again.
4. `const tape=await window.takeCentreFixtureTape()` retires owner and returns original packedOperations. Then `await window.runCapturedTape(tape,{wetSnapshots:true})` performs unchanged-input comparison and renderer snapshots.

The helper synthesizes no dabs and does not dispatch its own anonymous pen events. Root's CDP/controller or a human is the input source. The original edge-positioned captured tape remains the primary evidence. This second fixture specifically controls geometric placement: both waterline and pigmenttap are atworldY512.

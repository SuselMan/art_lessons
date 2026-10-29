# Incremental default-auto material generation

This is a closed CPU-generated native coverage branch in the existing prepass slots, not a PNG approximation. Canonical wire2 recipe/static source authority is validated by shared canonicalDefaultAutoCost against a constructor-owned verified-descriptor pin. The prepass caller must supply that already trusted pin; the DTO itself is not authorization. Legacy saved auto materials still fail before the PNG revision/cache path.

prepareSourceDefaultAutoMask captures immutable full geometry and coefficients, performs allocation/work checks, and owns one sample cursor. The synchronous reference drains that SAME arithmetic body. Scalar tiny AA preserves sy→sx order and per-sample U8 truncation; partial sums survive yields. NEON prefix/tail classification uses global x and full width. No stripe height is passed as geometry. Native84/29916 and whole56/24590 retained independent fixture bytes are checked across awkward sample/stripe boundaries.

Prepass preparation retains the same bounded RGBA8 slots/cache. One pending generation reserves <=16KiB A8 +64KiB RGBA +512 bytes cursor metadata through existing BrushMipCache BEFORE allocation. This metadata estimate is not a JS heap hard bound. Packing occurs only for completed pixels in the current sample quantum. Uploads use bounded full-width row stripes and texSubImage2D outside BrushGlBatch. No texture allocation on a generation miss. The old slot revision is invalidated before writes; owner/revision is published only after the full mask completes. New placement and post-raster mirrors are excluded from pixel revision; raw F64 signed zero and trusted source/profile are included.

CPU-only continuation turns do not capture GL state. Upload turns lease existing target storage synchronously and restore texture/unpack alignment/flip/premultiply state. No lease spans a yield. Workspace/slot residency is checked each turn; owner release/reset/context loss cancels and releases CPU reservations, and unpublished pixels cannot resolve. The executor serializes one generation with its existing work cursor; no scheduler, second raster cache, queue or budget is added.

Host tests cover actual seven compiled imported descriptors through pressure30 author inputs, V2 pack/decode and the real executor against lifetime mocks with an UNPREPARED PNG bank. This proves routing/ownership/admission, NOT GPU final pixels or UI responsiveness. The retained arithmetic Samsung gate R52/auto-incremental-device-result.json checks84 native masks exact with quantum64; its max1.5ms quantum/max5.2ms turn includes fixture boundary setup and is NOT a prepass/upload/UI throughput claim. Four milliseconds is cooperative, never a hard preemption guarantee.

UI Size overrides remain closed: Krita auto UI Size changes generator diameter and serializes/reconstructs brush settings, unlike a synthetic storedScale setter. Descriptor-storedScale1 is retained here. Gaussian/soft/density/randomness variants and additional engines are not admitted by this branch.


## Actual Samsung CPU→RGBA8 slot proof (2026-10-30)

Retained ignored receipt `fixes-v52/auto-prepass-device-result.json` records all56 independent original whole-wrapper fixtures/24590 A8 pixels through actual prepare→quantum64 CPU generation→texSubImage2D→resolveGroup→FBO readPixels. All RGBA output channels matched native A8 replicated four times, wrong0, GL[], placement-only cache hit uploads0, pending-cancel CPU balanced, final cache/reservations zero. Child/context closed, original tabs preserved and forward removed by the executing parent agent.

Adreno650/Chrome155: max measured quantum3.1ms, max turn4.5ms under cooperative3ms target,14 yields; setup/query/upload may exceed the cooperative target. This is retained-corpus slot/readback proof, not the executor, installed GUI dispatch, all-size UI responsiveness or full brush admission.

Proof bundle SHA256 `75b3bedf2bf186b9f200cfd9f5b63e4d8c8cb85432b2faf706bd8ec47b088720`; body `7cbfadde972b993280752089b13e77954478ba454d5dcc63ba21c84483985b19`; fixture `e1eb6349d4ec87e0eb763c4e1b9379644a85d780d01a16d63c8c79c4870b8545`. Production source snapshots checked before/after bundle:
- TransformedMaskPrepass.ts `54862eb5bf7d78b8131bc5635eeba13b02fa46170d4a733208a99f7e55210c9c`
- TransformedMaskPlan.ts `a77096b3b3ba2bbcaa5eedeba9ed5b9d8ced383bccdd6f4e6c339f58d758734d`
- sourceDefaultAutoDab.ts `58209f6d2ce6eb8178c625997b63f4afbf50cdb6fa7ed9ded8a9ca8e4ef413fe`
- sourceDefaultAutoMaskReference.ts `0b275531f49d96c65d02f173604fed6f13819ff113998c6263e0ab55db360477`


Retained runner/body: `fixes-v52/run-auto-prepass-device.mts` and `auto-prepass-device-body.js`. Supplementary `run-auto-prepass-stripes-device.mts`/`auto-prepass-stripes-device-result.json` exercises200×200 twice:80000 A8 pixels/320000 RGBA bytes/6 uploads, output matches the SAME CPU evaluator (not a new independent native fixture), cache hit0 uploads, GL0 and cleanup balanced. Measured max advance64 including upload5.8ms/maxturn8ms under3ms cooperative goal,60 yields. This explicitly leaves large-stripe upload/query responsiveness unproven; investigate arithmetic vs synchronous GL/IPC before changing sample quantum.

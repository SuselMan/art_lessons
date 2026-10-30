# Incremental default-auto material generation

This is a closed CPU-generated native coverage branch in the existing prepass slots, not a PNG approximation. Canonical wire2 recipe/static source authority is validated by shared canonicalDefaultAutoCost against a constructor-owned verified-descriptor pin. The prepass caller must supply that already trusted pin; the DTO itself is not authorization. Legacy saved auto materials still fail before the PNG revision/cache path.

prepareSourceDefaultAutoMask captures immutable full geometry and coefficients, performs allocation/work checks, and owns one sample cursor. The synchronous reference drains that SAME arithmetic body. Scalar tiny AA preserves sy→sx order and per-sample U8 truncation; partial sums survive yields. NEON prefix/tail classification uses global x and full width. No stripe height is passed as geometry. Native84/29916 and whole56/24590 retained independent fixture bytes are checked across awkward sample/stripe boundaries.

Prepass preparation retains the same bounded RGBA8 slots/cache. One pending generation reserves <=16KiB A8 +64KiB RGBA +512 bytes cursor metadata through existing BrushMipCache BEFORE allocation. This metadata estimate is not a JS heap hard bound. Packing occurs only for completed pixels in the current sample quantum. Uploads use bounded full-width row stripes and texSubImage2D outside BrushGlBatch. No texture allocation on a generation miss. The old slot revision is invalidated before writes; owner/revision is published only after the full mask completes. New placement and post-raster mirrors are excluded from pixel revision; raw F64 signed zero and trusted source/profile are included.

CPU-only continuation turns do not capture GL state. Upload turns lease existing target storage synchronously and restore texture/unpack alignment/flip/premultiply state. No lease spans a yield. Workspace/slot residency is checked each turn; owner release/reset/context loss cancels and releases CPU reservations, and unpublished pixels cannot resolve. The executor serializes one generation with its existing work cursor; no scheduler, second raster cache, queue or budget is added.

Host tests cover actual seven compiled imported descriptors through pressure30 author inputs, V2 pack/decode and the real executor against lifetime mocks with NO PNG bank constructed. This proves routing/ownership/admission, NOT GPU final pixels or UI responsiveness. The retained arithmetic Samsung gate R52/auto-incremental-device-result.json checks84 native masks exact with quantum64; its max1.5ms quantum/max5.2ms turn includes fixture boundary setup and is NOT a prepass/upload/UI throughput claim. Four milliseconds is cooperative, never a hard preemption guarantee.

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


## Narrow upload-state capsule proof

Stripe upload alone now snapshots exactly five values: active texture unit, unit0 binding, UNPACK_ALIGNMENT, UNPACK_FLIP_Y_WEBGL and UNPACK_PREMULTIPLY_ALPHA_WEBGL. It does not change framebuffer/program/VAO/attributes/capabilities, so those values are neither queried nor restored here. All existing draw/prepare capsules remain unchanged. Capture failure restores the temporary active-unit switch; cleanup attempts independent binding/flags and active restoration even after another restore throws. Primary upload failure is preserved across restore and lease-release failures. Host fault tests check exact primary object, flags/active unit, unpublished revision, CPU reservation and GPU lease cleanup.

Actual Samsung `auto-prepass-narrow-state-device-result.json` repeats all native56/24590 A8 pixels→RGBA replication exact, GL[], cachehit0 uploads, cancel balanced and cleanup zero, while sentinel active3/unit0+unit3bindings/alignment8/fliptrue/premulttrue are restored. Its source snapshot is TransformedMaskPrepass.ts SHA256 `88c1e474a27d5ee6c4e19be10e8e5bcd8ea417936b1026946517d80fba7edd60`; remaining source hashes above are unchanged. Bundle `8c38e91e8be5829c4cabb8a1a38df12b1cf9524acb1c4b3febdf6d99aacda5a3`, state body `505cf724148205ab0516553c8995cc8f17df6372d6fe3e9cff0603df1dacee10`. Runner `run-auto-prepass-narrow-state.mts` is retained in fixes-v52.

Supplementary `auto-prepass-narrow-profile-64-result.json`/`run-auto-prepass-narrow-profile.mts` keeps the SAME200×200 same-body CPU layout oracle, quantum64 and six stripe sizes64800/64800/30400 twice. Upload steps0.3–0.9ms versus earlier full-state branch2.9–5.4ms (quantum64) or2.9–7.3ms (quantum16); max arithmetic2ms/max turn4.1ms,53 yields. This is a sequential cold point benchmark with synchronous GPU/IPC waits, not randomized sustained throughput, all-size UI responsiveness or native GUI identity. Profile body `7cb6126efd250925c352d4f845172fbce5e0a4e35d980b367d0f54df5810f24d`, synthetic fixture `bfedea0aaeaf3be8de5577bc2114ed5e1c96e9f03168a241f9494a5a918e5af3`. Wrong0, GL[], cachehit0 uploads and cleanup balanced. Parent closed child/context, restored original tabs/parent and removed its forward/marker.


The added preparedCapacity metadata getter changes this whole-file SHA to `2b555d0e2b695caa81f6b5863dd153a804b4c80648347ed8cab9dda4051f66f5`; it does not alter arithmetic/upload code. New actual Samsung `auto7-derived-capacity-{64,8}-result.json` snapshots retain that SHA and cover full author→decoded executor pixels with actual independent prepass/compositor capacities. Prior narrow56 and200² receipts remain historical frozen-source proofs, not rewritten attestations for a changed file.


## Gaussian typed recipe continuation (host scope)

CanonicalAutoMaskMaterial now accepts shared default|Gaussian recipe/source data.
Shared canonicalAutoCost validates kind, generator, profile, source pin and window
before cache reuse or allocation. Revision includes source generator and profile;
valid default/Gaussian recipes with identical windows never alias, nor do the two
Gaussian profiles. Placement/mirror stays outside the raster revision.

prepareCanonicalAutoMask dispatches to the existing incremental services. No new
arithmetic body, queue, cache, CAS asset or quota. Gaussian coefficients are eight
fixed scalar fields in the cursor closure, not a per-pixel table. Existing fixed
cursor/pin metadata and bounded A8+RGBA stripe charges remain; advance uses the
same caller sample quantum and upload/failure/lifetime machinery.

Host tests cover native104 whole-wrapper masks/29098 A8 bytes replicated into all
four uploaded channels. Actual ready7×2profiles×30pressure author→adapter→wire
recipes (220 draws) reach prepass without a bank; moved/mirrored hits upload zero
bytes. Valid generator/profile changes miss the warmed cache; invalid ones fail
before upload. Owner release, reset(true) context forget and eviction cancel
pending generation and balance reservations. This is CPU/native-oracle plus
recording-GL evidence, not device execution or UI latency. Prior device receipts
above remain unchanged historical-source proofs.


Root's actual Samsung continuation proof (requested Gaussian NEON profile only;
scalar device coverage is not claimed, same production hashes) is retained as
`fixes-v52/gaussian7-executor-64-result.json` (all7) and
`gaussian7-executor-8-result.json` (largest2, real prepass64/compositor8).
Both report wrong0/maxDelta0, caller state restored, GL[], cleanupOk=true and
zero handles. They run actual author/adapter/encoder V2 packets through executor,
Tiled buffers, scratch, this prepass and composite against a source-law CPU oracle;
this is NOT independent native GUI whole-stroke identity or active UI latency.

Adapter SHA256 `56edf7f629f85b26d94a101f5a6f96bb8f2a8464faae28f4d5dc2f8c48a58e48`;
Plan `3de3684fdc3142415fc94624c27a258b6d6a155711e078d1849ffb2274a9f8c7`;
Prepass `26bd4099b5d56de526485a7e69984d483025d31b08e7e00ee9711fe103571a1e`.
64 bundle `0bf650079f90d21ac6adfb34c866c294a949ed928da2380026813c319b6bd2da`;
8 bundle `0bf650079f90d21ac6adfb34c866c294a949ed928da2380026813c319b6bd2da`. Body, fixture and complete source snapshots
are in the unchanged receipts. These three current production files were checked
against the stored source hashes before this provenance append.

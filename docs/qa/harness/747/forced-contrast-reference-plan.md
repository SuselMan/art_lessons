# Controlled-reference diagnostic (prepared only)

Goal: determine whether cross-GPU solver/coarse/final divergence persists when consumed Contrast reference P/C bytes are IDENTICAL. This is not a renderer fix, approved golden replacement or proof that all remaining differences are local to one shader. Regular background/selection/keep and every non-reference input remain computed by each GPU.

Private immutable payload prepared from Intel **dfe baseline** `default-dfe-contrast-export/report.json`, choosing `rgbaExports.contrastReferenceP/C`, never final `referenceP/C`. Sidecar tracked `forced-contrast-control-manifest.json` stores geometry, four raw input SHA and chosen reference SHA. Gzip bytes stay private under registered Lanpad cache. `payloadFromReport` verifies decoded bytes against TRUE Contrast stage hashes before accepting source.

Default OFF. To enable after root GPU/source handoff only: set `QA_FORCE_CONTRAST_REFERENCE_FILE` to that private payload for both operators. Standalone/Android installers use the same payload and browser code. Use connected-strip2048×512 only, normal DITHER, all other sampling/crop/skip flags OFF. Export RGBA and Contrast metadata normally if requested. Incompatible compact/transpose/R32/skip/DITHER-off flags are refused.

Actual controls:

- Native Contrast prepare first runs normally, then chosen full P/C are uploaded into actual reference output buffers BEFORE solver consumes them or stage capture.
- Paged global reference callback uploads the correct crop BEFORE referenceP material pages are written/global Background.capture.
- Every Paged windowReference callback uploads a bottom-up 1536² crop BEFORE native-window settlePlan. Negative/outside domain rows/columns are explicitly zero; no clamping/wrapping.
- Each plane's actual write is read back and compared exactly, application stage/rect/count retained. Payload bytes rehashed at end. Raw fixture hashes remain unchanged.
- Expected counts: one native prepare, ceil(W/512)×ceil(H/512) global-reference pages, one override per kept native window. Missing override coverage fails. All existing10stage and final same-GPU Native/Paged exact checks remain mandatory; if they fail, do not interpret cross-GPU result as an isolated later-stage proof.

After both devices: compare chosen manifest SHA + override coverage first; TRUE reference P/C stage SHA must be identical cross-GPU. Then locate first differing solved/coarse/final stage. Cross-GPU divergence after this controlled-reference boundary demonstrates an additional dependency/precision cause beyond different reference bytes; it does not by itself distinguish regular selection, field transport, LINEAR sampling, global mixing or quantization.

Preparation validation: node --check; three CPU tests PASS for all-direction bottom-up/partial-edge cropping and zero ambient, gzip/hash/input guards, both-plane actual readback verification, refusal of final-only export. No GPU run or application edit during preparation. Own Intel resources remain under KEEP.

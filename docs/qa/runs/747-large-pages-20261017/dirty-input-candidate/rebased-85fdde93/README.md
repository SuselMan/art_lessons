# Rebase onto phase-owner runtime

Base: `85fdde93fd8da2c9ee0c51bb24de615f85b89672`. External only, not applied.

Three-way merge against original `df1b7fe9`: additive conflicts resolved by retaining BOTH phase beginInput and presentationInputSignature host APIs/bindings, plus both phase-owner and fingerprint imports. All existing controller phase cancellation/admission/destroy hooks remain. Existing solver options skipEmptyFixedWindows, omitZeroForeignSolventLoad, detachedWindowSource and sourceCaptured admission remain unchanged.

`manifest.json` guards exact base/candidate SHA256 for all four implementation files. `dirty-input-revisions.patch` applies to the new base; `production-tests.patch` is the separate production-import 26-test regression. Virtual full files are inspection artifacts, not instructions to overwrite runtime files.

Rebased external overlay: 26 tests PASS. Both patch apply-checks PASS. External test copies use explicit local paths to execute these virtual files while retaining production dependencies. No GPU/native claims and no runtime changes.

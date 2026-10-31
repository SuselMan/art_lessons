# Canonical room tool availability

Scope: UI eligibility and selection only. No new source/BEGIN/rendering grant, policy activation, library loader, revision owner or engine changes.

Room derives one availability from the existing installed ORIGINAL read, its assertCurrent/profile, engineEpoch, connected/content state and existing brushLibraryRevision. Existing main.tsx subscriber remains the only library revision owner. Static admission reuses public canonicalSourceAuthorAdmission; current engine/source/BEGIN checks remain authoritative.

One useToolChoice gate serves toolbar, hotkey and floating tool selection. Canonical rooms offer only eligible digitalBrush and hand; legacy room policy stays unchanged. Atomic tool-store normalization reuses the existing source-default application law and uses the admitted source diameter even when imported metadata omits sourceDefaults. An automatic temporary hand fallback may select the first eligible brush when metadata arrives; explicitly choosing hand preserves navigation.

Both settings surfaces receive the SAME scoped schema object. Editable generic size/pressure switches are absent in this source-only lane, native diameter is readonly, color/opacity remain existing fields. Empty/restoring states preserve hand, import and explicit library refresh; no medium-round/pencil preparation fallback. A library refresh uses the existing loader/subscriber; preparation retries on that existing revision. Old async preparation cannot publish readiness after eligibility is withdrawn.

Validation:
- Tests-first new eligibility/normalization suite initially RED on missing implementation, retained diagnostic R52/canonical-tool-ui-red.log.
- Final focused/regression: 58 tests / 8 files PASS (eligibility, actual Basic2/Basic5 metadata, unsupported newer version, original lifetime stale before library update, atomic native size; hook empty/late/stale preparation; one selection gate; both render surfaces; legacy store/hotkeys/tool-choice/i18n).
- Scoped oxlint: zero errors; only existing Room engine-mount exhaustive-deps warning (same dependencies as before).
- git diff --check PASS.
- Combined app + service-worker no-emit typecheck 88046 PASS (R52/ui-image-idle-joint-web-tsc-final.log), includes concurrently frozen source-bank/coordinator/idle-confirmation units. First joint 68399 caught one test-fixture optional behavior.version; fixed by actual behavior existence narrowing, without casts.
- Scoped default is first eligible ID or empty, with explicit assertions; global legacy medium-round default stays untouched.

Host render tests verify data/prop routing and controls, not actual browser layout. Root owns the subsequent immutable UI build/Samsung screenshot/selection check. This unit creates no process, device context or temporary service.

2026-11-01 UI2 candidate, commit/build/QA activation held for ROOT actual G2 proof:
The optional per-preset metadata argument is the existing
importedBrushAssetMetadata getter. Room passes it inside the SAME availability
memo invalidated by brushLibraryRevision/engine/read/content owners; no new
metadata state, asset fetch, store, hook or network lifecycle. Manifest metadata
is availability only: pixels, engine resources, original source pin and server
BEGIN remain independently checked. Missing/ambiguous/wrong-side/accessor or
throwing metadata denies the image option without procedural fallback.

Both original DATA1 Basic6 and ordered GIH sources use SAME
canonicalSourceAuthorAdmission and its nativeSizePx. No duplicate size formula,
DATA conversion or widened sensor admission: Basic6=7.5, Mountains=360,
Graphite=16. Existing global legacy schema/size controls remain unchanged; the
scoped source schema continues to omit generic size/pressure controls. Stale
original read, restoring content, disabled digitalBrush and unsupported newest
version still deny. Image drawingAngle/fan rules remain the engine admission's
existing rules; tiltDirection does not become a pointer grant.

Tests-first image eligibility was RED (empty rather than ready), then GREEN on
actual original descriptors and declared metadata. Additional tests verify
native-size store normalization, full latest-version refusal, all stale/disabled
states, sensor refusal and metadata getter non-invocation. HOST tests establish
eligibility/prop routing only; actual product UI/Samsung is ROOT-owned and not
claimed by this candidate. No device/service/resource was started here.
UI2 final HOST gate:24 tests/4 suites PASS (availability, tool choice and
ToolSync), one worker; targeted actual Room root + UI2 availability/test TSC
PASS (R52/image-ui2.tsconfig.json, no exclusions or production type suppression).
Scoped lint0 errors, existing Room effect-dependency warning only; owned diff
check PASS. Commit/build remain held until ROOT actual G2 proof and explicit cue.
ROOT subsequently accepted the full app gate and removed the internal commit
hold after actual G2 Basic6/Graphite public API/cold checks. This permits the
local UI2 commit; it is NOT a completed fresh Mountains UI selection claim.
Existing useToolSync remains the sole prepareBrushPresets/publish/CAS loading
path before engine.prepareBrush. No engine fetch or ad-hoc pixel installation
was added. ROOT owns the next immutable UI build and actual selection proof.

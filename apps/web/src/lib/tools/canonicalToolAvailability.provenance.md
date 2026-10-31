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

# Existing finite-format orchestration

QA-only; prepared during GPU freeze, **not hardware-run yet**. `finite-existing-matrix.cjs` defaults to offline metadata validation. No room/layer creation, reset or deletion. It reads existing ledger fixtures, requires an explicit private JSON map `{a4p: "existingLayerId", ...}`; do not guess an ID or use arbitrary Undo history.

```
node docs/qa/harness/747/finite-existing-matrix.cjs
```

To execute after exclusive device/source allocation: set QA_RUN=1, QA_GPU_GATE=allocated-and-frozen, QA_SOURCE, QA_CDP, QA_BASE_URL, QA_OUTPUT (new path), QA_EXISTING_LAYER_MAP. QA_FORMAT optionally selects one bounded format. It runs sequentially and stops on first failure. Resource registration/TTL/browser ownership stays with the operator; no extra browser process/service is launched, only isolated contexts on the assigned real device. No global cookies/default tabs changed.

Runner `finite-existing-android.cjs` reuses trusted raw-CDP input and cleanup from room-public-android, but requires an existing layer; never appends layer_add. It records accepted baseline IDs, performs its own seam+edge gestures, checks undoTarget/redoTarget BEFORE acting, and checks exact generated meta target IDs. Only operations created by this run are Undo targets. Explicit layer Dry, UndoDry and RedoDry are recorded operations; optional cache/hidden replay must be OFF. Natural canonical readiness and complete local API history are required before local replay oracle; covered/oversize history produces a bounded harness refusal rather than a false PASS.

All physical/goal bytes are captured before oracle; compare full clipped finite page, Dry to saved wet canonical, Redo to saved pre-Undo target, then cold Dry reload. No canonicalTiles/close/forced solver work to manufacture readiness. Existing source material is retained. Long gestures that become multiple operations are refused for lifecycle checks until explicit grouped-Undo support is added.

Scope is one real pointer author, not a peer observer proof. Wet cold join, full API pagination/covered-history independent replay, all seam intersections, water eligibility after UndoDry via fresh water and native two-device convergence remain separate checklist gaps. The script intentionally does not claim these. Host fit must expose test world coordinates; occlusion fails before pen input instead of forcing engine transforms. Runtime phase diagnostics are available via inherited telemetry, no fixed120MiB assertion is applied by this runner.

Validation during preparation: node --check for both scripts; offline six-format ledger plan. GPU execution remains pending operator gate.

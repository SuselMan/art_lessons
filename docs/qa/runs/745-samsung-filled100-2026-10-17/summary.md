# Samsung native watercolor Undo and populated100 room load

Runtime0be6e667, Adreno650, DPR2.125, touch5, fixed300MiB GPU budget. Battery100%/AC,39.8→39.9°C. Shared QA backend concurrently loaded; no isolated benchmark claim.

Native trusted pen watercolor is visible beforeUP. TrustedCtrlZ removes the mark completely; CtrlShiftZ restores the exact canonical hash, both checked against independent sameGPU replay. Undo swap latency was not instrumented.

| Loaded mode | UI ready afterjoin ms | Snapshot | Replay | Actual vs full103op oracle |
|---|---:|---:|---:|---:|
| normal | 1234 | 614 | 5 | 0 |
| normal-warm-reload | 967 | 505 | 2 | 0 |
| annotations | 1269 | 680 | 5 | 0 |
| annotations-warm-reload | 1096 | 634 | 2 | 0 |

This is1024²,100×8watercolor dabs, one recordedDry after100 plus one annotation. Cached entries restore snapshotSeq103/tail2. Rawlog102 omits one stroke covered by a positive snapshot checkpoint; actual resident bytes are captured BEFORE an oracle constructed from all103 authoritative events. Every case has0changed channels andGLerror0. The live log is restored in finally; no actual canvas repair is used.

Initial newly seeded entry before subsequent snapshot reuse had UIready3284ms; browsercachecold is not claimed. Review image is real1024²export/upload; annotation mode and earlyhistory latch precede finalcanvas readiness. Navigation/CDP time and reviewimage documentclock are not relabelled UIready.

All own contexts/rooms/auth cleaned; shared Samsung forward remains with QA.

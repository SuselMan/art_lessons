# Requested Accum storage ownership

This is an independently authored ownership/admission ledger, not a rendering algorithm or a physical GPU residency measurement. It counts requested AccumulationBuffer RGBA8 base/mip storage exactly once per actual GL context epoch. The engine attaches with Infinity only. Raw textures, VBOs, drawing buffers, driver overhead and deferred deletion remain outside this **incomplete** domain. The watercolor budget retains its old meaning.

A reservation is a promise; a successful allocation transfers only the materialized bytes to a lease. Closing a caller-owned reservation remains the caller's responsibility. Failed construction does not consume its remaining promise. Pool release retains resident bytes; pool reuse adds none; actual deletion refunds once. Resize needs both old and new storage headroom. Same-context engine replacement reuses the same owner rather than resetting existing charges.

Allocation boundaries report one consumed preexisting GL error before mutation, rather than draining it or calling it allocation OOM. The texture/FBO and first mip allocation boundaries check void GL errors. No GL queries are introduced on draws or metadata snapshots. Healthy deletion uses the API-defined deletion operation; there is no per-destroy getError. A JavaScript deletion exception after attempted storage leaves a conservative **numeric orphan charge included within residentBytes**, not added to it again; it has no retained texture/handle/retry journal and clears only on context loss. FBO-only cleanup failure does not invent texture storage. Failed first mip generation may already have allocated levels, so its worst-case chain remains charged to the actual texture until deletion. A separately confirmed flag prevents conservative accounting from being mistaken for successful generation: repeated failed first-generation retries stay on the cold-checked path with zero additional reservation/charge until success.

Context loss invalidates the old owner and FBO-completeness epoch. Stale reservation use rejects, stale lease destruction cannot subtract from or delete names in the restored epoch. Default engine construction has no finite cap: its existing constructor-wide partial-init rollback is not complete, and exposing a finite engine option would create an unsafe new failure path. Finite policy is currently internal/standalone Accum capability only. Real engine finite admission requires constructor cleanup/preflight, raw-owner migration and explicit measured policy in subsequent units.

Evidence: fixes-v52/accum-owner-{focused,buffer-regressions,final-focused,final-regressions,common-web-tsc,lint}.log. Host MockGL integration tests verify actual constructors, scratch pool reuse/trim, two real engines sharing one context, external ticket consumption, resize peak, unknown/foreign/stale tokens, allocation GL errors, partial cleanup and numeric orphan semantics. These tests do not establish driver memory use or prevention of browser tab OOM. No device/runtime/dependency resource was created for this unit.

Final host gate: 172 tests across 20 buffer/engine ownership files passed, including repeated void mip OOM→retry→success and constructor framebuffer cleanup despite deletion faults. Common web typecheck and scoped lint are recorded alongside the tests; no device performance claim.

Subsequent actual Samsung SM-T970/Adreno650/Chrome155 regression uses source
at51cb40a57: seven Gaussian author/adapter/packed V2 paths through the actual
executor/Tiled/scratch/prepass/composite64, plus largest two masks/composite8.
All9 final64×64 surfaces match host source-law expected (wrong0/maxDelta0),
hostile GL state is restored, GL[]/poison[], and all owned GL handles are zero.
The actual context ledger is observed after every trial cleanup: resident,
reserved and orphan bytes are all zero, with complete=false. Infinity is serialized
as null in numeric JSON snapshots; no finite engine policy was activated.
This proves the tested allocation/cleanup paths, not original GUI identity,
physical GPU residency, tablet OOM prevention or UI latency. Both children closed,
original three tabs preserved, parent restored, forward19236 and job markers
removed. Durable receipts: fixes-v52/gaussian7-owner-executor-device-summary.json
and gaussian7-owner-executor-{64,8}-{result,cleanup}.json (source/bundle/body hashes).

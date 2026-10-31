# Final wash initialization reuses its existing GL turn

Exact production scope: CanonicalFrameExecutor only. The existing captured
copy/clear turn releases its short target lease, then calls the same extracted
paintPrepared body if ALL tile initializations are done and the SAME advance
clock remains below4ms. Earlier initializations still yield; any actual
allocation still yields. Pixel order, max8 commands, input/ordinal/source state,
empty-tail C2 behavior, foreign GL validation and owners remain unchanged.
The caller returns actual pending/checkpoint state when joined painting drains
the frame. No extra state capture, queue, pool, registry or gl.finish.

Tests-first3fail/124pass demonstrate missing join behavior. Implementation:
127 executor/coordinator tests PASS, plus explicit max8 joined-command witness
PASS (128 aggregate); 103 regression tests across five files PASS. A test that
spends exactly4ms clearing refuses paint, and a two-tile witness proves all
clears precede pixels. The joined second-paint failure retires pins and pool
owners before external poison and preserves the exact original error. Actual
CURRENT_PROGRAM capture count is one for warm init+paint, and final raw frame
returns pendingfalse/checkpointfalse until existing raw ownership is transferred.
Preparation-only fixtures call the actual private physical method with an
exhausted stage clock; ownership/allocation/copy code is never replaced by no-op.
Scoped lint and diff PASS; common app+SW18415 PASS against final sourcefreeze.
Paired Samsung gate passed160/160 surfaces with0wrongRGBA, GL0, hostile state
restored, leases/owners/storage0; both owncontexts/children/forwards closed and
original3tabs unchanged. Advance-only getParameter1640→1532 and isEnabled330→276
prove nine full captures removed. Upload196, copy50, draw30, cold status5 and
attachment5 remain identical. Turns803→846 increased; max50.2→31.9ms are
standalone samples, both>4ms. This is not elapsed-time improvement proof.
Compact JSON includes source/bundle/input hashes, rows and strict cleanup.
Duplicate raw outputs removed after compact proof.

Prepared device pair uses existing actual5 source inputs, same author/adapter/
encoder/executor/coordinator and exact source-law CPU oracle. Baseline only
Executor is RAM-read from527b96ba5; current uses frozen worktree. The other114
module inputs and the body/fixture must be identical. Diagnostic capacity64, no UI,
room activation, complete finiteGPUcap or4ms guarantee. The device was claimed only after Color strictFREE→ROOT, ROOT explicitFREE→us
and our ACK. StrictFREE returned to ROOT; no own temporary resources remain.

# Bounded native owner retirement

`retire(): Promise<void>` is separate from guarded normal `destroy()`. It immediately rejects further input, detaches attached pointer input, wakes a pending frame yield and prevents subsequent solver quanta/final finish/presentation callbacks. The outstanding job disposes exactly once in its existing command scope, then resource owners release. Cancellation never calls gesture.end or synthesizes a recorded operation.

A host sets its own disposed flag immediately and calls `runner.retire()` BEFORE destroying the backend. In unmount cleanup: `void runner.retire().finally(() => backend.destroy())`; status/drain/error callbacks must check the host disposed flag. The runner cannot guard status callbacks implemented outside it. Backend destroy before retirement completes violates the live-scope disposal contract.

Retirement does not wait indefinitely for GPU completion: existing backend scope-release/deferred texture retirement retains submitted resources until queue completion, and subsequent whole-device destruction owns terminal cleanup. Normal destroy still rejects active/busy; idle normal destruction remains supported. Retirement and resource release are idempotent.

Verified: app TypeScript, lint and9runner tests, including cancellation of an unresolved frame wait, exactly-once job disposal, skipped finish, active/out-of-bounds input cancellation without new operations, and rejection of late input/replay. Shader/dispatch math unchanged. No new hardware workload.

# OFF proposal: reuse основного owner и preview

Это незавершённый QA-кандидат, не READY для устройства. Production и текущий GPU worktree не изменены.

`owner-fifo-install.reuse-proposal.mjs` — локальная копия actual installer с opt-in `qaReuseOwners=false`. Импорты указывают на read-only GPU worktree, поэтому это исследовательский snapshot, не переносимый продуктовый модуль.

Изменения: source.retire/payload/main lease отложены; preview detach происходит до retirement; только возврат существующего `_syncContinuationGpu` удостоверяет общий serial. Instance drawArrays/copyTexSubImage2D/copyTexImage2D/clear/readPixels помечают все attached и retired bundles. Новых finish на DOWN нет. WebGL2 cached raw и неакварельный ANGLE path отвергаются явно. Preview release использует narrow API exact retired owner, без собственной выдачи certificate.

CPU: 8 actual-installer snapshot tests, 3 ALL-consumer hook tests, 5 ledger tests PASS. Installer fixture использует mock source/pool; отдельный bundle-retirement fixture использует actual PrewarmedGlOwnerPool и OwnedGlPreparedSource с mock GPU buffers. Это не доказательство аппаратной безопасности или качества.

## Блокер

Lost generation запрещает admissions/certificates/reuse. Однако existing main pool disposeAfterFence отвергает held leases. Нужен явный teardown-on-loss API, который уничтожает owned storage/CPU payload после остановки производителей, не возвращая slot в available. Existing source.retire возвращает lease и потому не является таким API. Пока отсутствует этот контракт, actual installer proposal не следует запускать. Preview context-loss cleanup и main teardown должны быть согласованы; новый generation требует нового installer.

Также аппаратно не проверены ранний preview + четвёртый мазок, cached callers, cancel/rebuild и полное совпадение конечных canonical полей. Defaults остаются OFF.

## Narrow lost teardown draft

`main-owner-lost-generation.patch` applies to current ROOT pool without copying installer/float settings. `closeLostGeneration()` asserts actual context loss, closes take and suppresses release-to-available. Hook `destroyLostGeneration` then stops producers, cancels future jobs, restores/calls original source.retire to clear CPU chunks and leased bookkeeping, and finally calls pool `destroyLostGeneration()` to destroy only owned fields. No certificate, finish or preview reuse is issued; old coordinator stays lost. New generation needs a fresh pool. A CPU chronology test covers loss required/stop→cancel→payload→destroy/no certification. The patch still requires actual installer listener wiring and real pool test before READY.

## Consolidated current-ROOT patch: CPU READY

`actual-root-owner-reuse.patch` is the minimal pool + installer diff (applies to ROOT 731733c9). It preserves diagnosticFloatPreview/direct/linear flags and current preview release API; `qaReuseOwners` defaults false. Apply after installing the shared hook modules from the preceding commits. `build-reuse-root-patch.py` reproduces the diff from current ROOT; generated-current-reuse-install.mjs and generated-lost-pool.ts are **offline test artifacts**, not a second product installer.

Loss listener requires actual isContextLost, closes old pool first, stops preview RAF via handleContextLoss, cancels original canonical future jobs, completes active cancellation, invokes captured original source.retire for CPU payload/old lease bookkeeping, destroys old owned fields, and clears installer visibility map. No idle certificate is invented. Later DOWN returns; dispose removes the listener and restores methods. Existing engine lost-context cleanup remains responsible for its own resources; this path never clears a foreign pool. New generation requires reinstall with new pool.

Validation: current-ROOT installer fixture 9 tests plus patched real pool fixture 1 test PASS; 4 hook tests PASS; generated installer syntax PASS; git apply --check PASS. Pool fixture confirms take rejection after loss, free remains zero when old lease is released, exactly 39 owned buffers destroyed once, and a separately allocated fresh generation has three slots. Installer fixture confirms loss listener registration, cancelled jobs, no finish, stale DOWN ignored, and dispose cleanup. GPU calls are mocked; early preview hardware, actual destruction-on-loss and fourth Room stroke are still unverified. This is READY for parent code review, not a claim of hardware success.

Commands: `npx vitest run --config docs/qa/harness/728-room-moment/current-reuse-vitest.config.mjs --maxWorkers=2`; `node --test docs/qa/harness/728-room-moment/OwnedQaReuseHooks.test.mjs`.

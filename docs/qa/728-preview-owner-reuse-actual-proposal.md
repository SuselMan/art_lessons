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

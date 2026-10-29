# Синхронный GL batch, без нового raster закона

Internal opt-in coordinator `runBrushGlBatch`: прежние `resolveGroup`/`drawSource`
исполняют те же validation, row staging, copy и draw bodies. Optional второй
аргумент frame только объединяет state/lease scopes. Существующий standalone API
сохраняет все isTexture/isBuffer/sampler/FBO guards и самостоятельное восстановление.
Численные shader strings, source geometry, wire и текущие painters не изменены.

Основание для оптимизации: private R52/canonical-stock-perf-device-result.json,
stock84, 1234 requests. Instrumented readonly GL methods заняли около5.645s из
6.740s, в том числе getParameter/getTexParameter/isTexture/isBuffer/FBO status.
Instrumentation влияет на измерение; это не обещание фиксированного ускорения.

Batch predeclares prepared services, extra cached resources и exact external
lifetime objects. Проверяется одна gl/cache/BrushMipCache/extensions identity,
actual cache charges и GPU union<=существующего budget. Никаких GPU allocations.
Transient CPU reservation из того же BrushMipCache:
4096+96*resourceCount+128*ownerCount+256*participantCount bytes. Это conservative
metadata estimate, не hard JS/driver heap guarantee. Reserve освобождается finally;
новой квоты нет. Ограничения declarations:<=8participants,<=64owners,<=1024resources.

Bookkeeping/service entry/cache lease не меняют GL. Один capture ПЕРЕД external
lease callbacks покрывает и их GL-binding mutations/throws. Epoch проверяется
после acquisition и перед каждой командой. Attribute union всех prepared programs,
texture units0..2, прежняя BrushGlState capsule и caller OES/ANGLE/fallback pointers.
Sampler journal хранит4 параметра на unique sampled texture. FBO completeness и
attachment проверяются один раз на unique held framebuffer; смена texture/geometry
того же FBO в batch отклоняется. Leases удерживаются до восстановления sampler
journal→caller GL state; после этого освобождаются owners/cache/services.

Никакого ambient currentFrame. Frame constructor/open/close требуют module-private
capability; participant admission только during acquisition. Closed/foreign/stale
frames, reentry, prepare/reset/releaseOwner во время scope и thenable return
отклоняются. Callback internal synchronous: произвольные GL writes/owner mutation/
await запрещены контрактом. Lost context пропускает GL restore, cleanup leases и
CPU reservations выполняется. Ошибка cleanup не заменяет первичную command error.

Caller уступает event loop ПОСЛЕ batch. shouldYield сигнализирует >=8draws либо
>=4ms после первого draw. Следующая самостоятельная команда за пределами budget
отклоняется. Уже admitted prepass group получает право завершить первый paired
composite draw, даже если mask preparation пересекла soft4ms; hard8draw cap остаётся.
Group token/release не затрагивает новое поколение. До8groups на batch; следующий
resolveGroup требует release предыдущего. Незакрытая группа закрывается finally.
Это bounded command submission, не гарантия завершения одного GPU draw за4ms.

36 focused CPU/MockGL checks на момент реализации: common real prepass→composite
one-capture, HIT/MISS, FBO/sampler query counts, exact caller pointer/divisor/VAO
restoration, owner callback mutation/failure, draw failure, reentry/thenable,
context/cache/epoch/undeclared resource checks, bounded command/time crossing.
Это lifecycle/state доказательство, не CPU shader mirror или GPU pixel oracle.
Новый batch actual-device gate пока pending. Прежние isolated pass proofs
1bc11f408 и a70d8c2e0 остаются привязаны к своим источникам/receipts; эта запись
не выдаёт их за уже проверенный новый batching path.

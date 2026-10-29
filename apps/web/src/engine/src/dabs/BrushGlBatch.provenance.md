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
4096+96*resourceCount+96*ownedSamplerCount+128*ownerCount+256*participantCount bytes. Это conservative
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

Caller уступает event loop ПОСЛЕ batch. shouldYield сигнализирует >=8 submitted commands (включая empty clips),
>=8groups либо >=4ms после первой команды/группы. Только hard8 command/group bounds отклоняют следующую команду.
Wall-clock deadline кооперативный: metadata между caller shouldYield check и
следующим beginGroup может пересечь4ms, но это не отказ/потеря команды. Уже admitted prepass group получает право завершить первый paired
composite draw, даже если mask preparation пересекла soft4ms; hard8draw cap остаётся.
Group token/release не затрагивает новое поколение. До8groups на batch; следующий
resolveGroup требует release предыдущего. Незакрытая группа закрывается finally.
Это bounded command submission, не гарантия завершения одного GPU draw за4ms.

39 focused CPU/MockGL checks на момент реализации: common real prepass→composite
one-capture, HIT/MISS, FBO/sampler query counts, exact caller pointer/divisor/VAO
restoration, owner callback mutation/failure, draw failure, reentry/thenable,
context/cache/epoch/undeclared resource checks, bounded command/time crossing.
Это lifecycle/state доказательство, не CPU shader mirror или GPU pixel oracle.
На Samsung SM-T970/Adreno650 новый batch прошёл отдельный brush84 ABBA gate
(source15f484ede; private R52/canonical-stock-batch-device-result.json):
standalone/batch/batch/standalone по1234 draws, все RGBA bytes exact, GL[],
hotNoUploads/stateRestored/cleanup true. Total wall10477.7/5534.0/3347.3/17408.1ms;
order/thermal drift не позволяет обещать универсальный коэффициент. Batch scopes
556/449, getParameter6694/5410 против28404 на standalone; getTexParameter
4084/3580 против4944. Общие maxrAF133.7ms/maxturn154.6ms включают standalone
и cold work, поэтому не доказывают отзывчивость batch. Полный17-brush batch gate
и отдельная оценка больших отпечатков ещё pending. Это standalone source proof,
не новая сборка активного приложения и не native fused arithmetic identity.
Прежние isolated pass proofs
1bc11f408 и a70d8c2e0 остаются привязаны к своим источникам/receipts; новый
brush84 gate дополняет их, но не расширяет численный профиль или engine coverage.


## Owned sampler capability: новый путь, GPU gate pending

`BrushGlBatchInfo.ownedPointSamplers` объявляет только внутренний owning service.
Первый и единственный production producer — private prepass output slots,
созданные factory NEAREST/NEAREST/CLAMP/CLAMP. View — immutable-sampler borrow:
borrowers и external lease callbacks не вправе менять texParameteri этих slots.
Это не caller flag, asset brand, format/vendor policy или cross-frame GL cache.

Entry(key,texture,bytes,epoch) проверяется против exact prepared cache union,
actual key/handle/charge и participant epoch до capture/acquisition. Два owners
либо key/charge/epoch aliases одного handle отклоняются. На каждом skip sampler
owner epoch и actual residency проверяются ещё раз; context/reset не сохраняет
capability в следующем frame. Sampler metadata CPU map включён в тот же reserve.

Только такой source не попадает в journal и не вызывает sampler query/set/restore.
Внешние straightRGBA8, synthetic cached masks и все standalone APIs по-прежнему
сохраняют4actual params, временно NEAREST/CLAMP и возвращают их даже при throw.
Mixed regression показывает owned0query + external4queries/unique; exact real
prepass→composite test подтверждает0samplerqueries на двух ordered draws. Stale
owner epoch, wrong key/handle/charge и conflicting aliases reject до effects.
43 focused tests PASS; это CPU/state checks, не device pixel receipt нового пути.

Baseline guarded full17 Samsung gate относится к **15f484ede**, до capability:
17presets/3256requests/203chunks, wrong0/GL[], hotuploads0,
actualstateRestorationChecked/stateRestored/cleanup true. Receipt private
R52/canonical-stock-full17-batch-guards-device-result.json. Accepted baseline
не заменяет необходимый fresh owned-sampler GPU proof.

# Retained pointer admission — CPU foundation, runtime HOLD

Статус: изолированный прототип без Engine activation, frontend/device изменений.

`RetainedPointerAdmission` копирует plain admission data при DOWN: opts, layer,
stroke identity, wet payload, generation. Nested values заморожены. Нормализованные
реальные PointerData копируются при получении; predictions API отсутствует.
Actual WatercolorCanonicalFIFO сохраняет порядок predecessor → полный gesture →
Undo/Dry. UP может прийти до публикации предыдущего owner. Capacity overflow
явно отвергает весь неисполненный gesture; частичная геометрия не публикуется.
Контекст применяется синхронным `port.scope`, adapter обязан восстановить его
в finally. Новый material source всё ещё ждёт предыдущий owner.

Проверено 6 CPU tests: actual PointerInput coalesced normalization (speed,
timeStamp, pressure, tilt, geometry), изменение исходного brush/layer packet,
ранний UP, Undo/Dry порядок actualFIFO, overflow, stale generation/context
cancel, throw restoration, nested immutability/plain-data fail-closed.
Это НЕ тест реального Engine packed-operation/pixel/wet parity.

## Точные блокеры подключения

- Engine `_onStartUntimed` читает активный слой, `_opts`, constraints/snap,
  paperWet, wash/signature/time и сам создаёт washId/strokeId. Deferred dispatch
  с заменой только `_opts` недостаточен. Нужен admission-context argument,
  который используется всеми material-dependent start reads; без глобальной
  подмены Date/performance. Wet semantics необходимо определить при logical
  DOWN и проверить against synchronous original.
- Scope port пока абстрактный: actual Engine handlers не подключены. Нужна
  actual Engine/DabSystem parity fixture с одинаковыми IDs/packed/wet после
  изменения layer/brush между receipt и execution. Нынешние packet tests не
  подменяют эту проверку.
- Прототип ждёт полного UP, затем вызывает handlers синхронно. Он сохраняет
  события, но не обещает latency/frame-gap улучшения. Пока gesture открыт,
  generator может yield каждый RAF; runtime будет нуждаться в event-driven
  wakeup, не постоянном polling.
- Ошибка во время dispatch может оставить частично изменённый Engine material;
  actualFIFO отменяет successors, но rollback/recovery этот helper не делает.
- Все material writers должны соблюдать exclusive owner; identity passport не
  видит изменение содержимого того же texture. Не разрешать pointer bypass.

Следующий узкий шаг: admission-aware `_onStart` adapter + actual Engine parity
fixture; только после этого оценивать runtime source queue. Default/runtime OFF.

## Actual Engine seam — ограниченный сухой pencil-path

Добавлен DEV constructor-only `diagnosticPointerAdmission`, без Room/query и
без автоматического PointerInput подключения. Оpaque packet привязан к данному
Engine WeakMap, exact layer buffer и journal revision. Captured opts/ruler/nib/
tilt/stroke ID применяются только на время существующего handler и возвращаются
в finally. Receipt wall time передаётся явно на каждый sample; global clocks не
заменяются. Это сохраняет operation timestamp receipt, не delayed execution.

Actual Engine tests сравнивают исходный synchronous pencil-handler и retained
handler: exact packed geometry/pressure, color/preset/IDs/actor/layer/seq после
смены tool/size/layer. Raw timestamps сознательно разные: original использует
реальный Date.now, diagnostic использует fixture receipt wall time 1002;
последний проверяется отдельно, никакой нормализации original metadata нет.
Actual FIFO + actual Engine проверяет owner→source→Undo→Dry с ранним UP.

Watercolor, wet/ribbon/open wash/pending solver, changed journal/layer/paper scale,
OFF, destroyed owner отвергаются. PaperWetness не snapshotable текущим API:
достаточный fork должен сохранить committed+pending cells, drained set, peak,
bounds и исходные cell timestamps. Кроме DOWN нужны времена каждого generated
batch/sampleUnderNib/deposit/UP commit. Это отдельный wet HOLD, не dry parity.
Код не претендует на GPU immutable material или отсутствие частичных material
изменений при исключении handler: packet инвалидируется, recovery не реализован.

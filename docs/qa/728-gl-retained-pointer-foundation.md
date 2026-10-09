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

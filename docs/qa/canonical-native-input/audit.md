# Канонический ввод акварели: CPU boundary

База: 401bee85. Это отдельный input/log adapter, а не реализация PencilEngineAPI или Room.

## Источники

- `PointerInput.ts`: capture, coalesced events, pressure calibration, transform and speed/timeStamp. Adapter использует существующий класс целиком.
- `index.ts:5886 _onStart`: GPU/layer/checkpoint guards, выбор wash/scratch остаются владельцу. Конфигурация DabSystem и обработка первого события повторены в `CanonicalWatercolorGesture.begin`.
- `index.ts:6204 _onMove`: snap до spline; реальный DabSystem с задержкой одного события; elapsed вычисляется от первого DOM timeStamp.
- `index.ts:6336 _onEnd`: endStroke, затем taper, pooling, lift именно в этом порядке. Lift использует предыдущий chunk tail. Последующий paint перезаписывает t всем дабам этой партии, как production.
- `index.ts:6557 _paintStrokeDabs`: opacity bake, t, quantized committed wet sampling до подготовки, drain/deposit pending после подготовки. Радиус PaperWetness.deposit намеренно не включает nib multiplier/aspect.
- `index.ts:6841–6920`: bbox/max half, 800-dab threshold, 1100/2200 span по реальному nib, packed operation, tail/profile reset; boundary callback оставляет finish/newFilm владельцу.
- `linerPresets.ts:255`: watercolor не имеет dwell timer.

## Контракт

`onPreparedChunk` вызывается синхронно один раз на event batch. Получает оригинальные baked dabs, предыдущий dab, quantized wet, mottle seed, stroke/wash/layer/user ids и operationIndex/dabOffset. Владелец вызывает `prepareCanonicalStrokeChunk` и возвращает его standing/dabPool; затем adapter обновляет PaperWetness этими же значениями. CPU delivery нельзя повторно продвигать при GPU tile fanout.

`onLocalStroke` получает настоящую Operation с packDabs и wet только если профиль не полностью сухой. Полные partial operations и окончательная operation имеют одни stroke/wash ids, но разные operation ids от предоставленного генератора. Никакого ACK нет; pending-log append, transport и server seq остаются владельцу.

`onChunkBoundary` должен синхронно зафиксировать порядок finish/newFilm/последующего chunk. Async GPU submit допустим только при сохранении FIFO. Перед begin владелец выбирает wash и создаёт/сбрасывает delivery state; после end выполняет finish/settle/composite. Adapter не восстанавливает GL и не принимает вход при запрещённом владельцем рисовании: guards обязан применять владелец до begin.

Поддерживается только watercolor. Prediction/liveTip исключены как production watercolor path. Live packet throttling/unsent tail — отдельная обязанность владельца, adapter не притворяется сетевым API. Настройки фиксированы на gesture; изменение размера/opacity в середине gesture не поддерживается этим ограниченным adapter.

## Проверка

Тест вызывает реальные production `_onStart/_onMove/_onEnd` и перехватывает лишь `_paintDabs` (GPU исключён). Сравниваются каждое событие baked dabs/wet и все packed operation поля кроме генерируемых id/timestamp, round/chisel, pressure/tilt/400px/partial span. Это gate CPU ввода/записи, не доказательство визуального или аппаратного поведения WebGPU.

Пример соединения с CPU source builder (одна подготовка на batch, tile metadata выбирает владелец):

```ts
onPreparedChunk(chunk) {
  const prepared = prepareCanonicalStrokeChunk(deliveryState, {
    ...frozenSourceSettings,
    dabs: chunk.dabs, previous: chunk.previous,
    wetProfile: chunk.wet, strokeSeed: chunk.strokeSeed,
    tile: sourceTile,
  })
  enqueueSourceCommands(prepared.commands, chunk) // FIFO; no ACK here
  return { standing: deliveryState.standing, dabPool: deliveryState.dabPool }
}
```

Многоплиточное исполнение требует отдельного разделения delivery и per-tile emission. Текущий tile-specific builder не следует вызывать несколько раз с одним mutable state для одной партии. Это явно оставленный owner integration blocker, не скрытое доказательство готовности native Room.

## Независимый повторный review

Исправлена ошибочная первоначальная команда typecheck: `tsconfig.json` содержит references и не является app check. Обязательная команда — `npm run typecheck --workspace=apps/web` (app + service worker). Исправлены erasableSyntaxOnly constructor, void setters PointerInput и неизвестное test option.

Для каждой partial operation отдельно проверяются число исходных дабов, конкатенация quantized wet и абсолютный dabOffset. Wet не пересчитывается при flush: профили сбрасываются вместе с той operation, которой принадлежат. DabSystem/taper/lift остаются исходными функциями; lift получает chunk tail до flush, paint затем перезаписывает t партии, как production. PaperWetness имеет отдельные clock samples до source preparation и после него; commit только при end, dropPending при begin. Callback обязан вернуть standing и dabPool от той же единственной source preparation; fallback nominal water/zero pool сохранён ровно как production, не является заменой реальной delivery.

## Воспроизведение

На уменьшенном холсте (zoom0.32) нарисовать акварель и показать первый кадр до завершения её asynchronous settle. Финальный composite пишет в уже выданные fine tile buffers, но не объявляет coarse pyramid dirty повторно.

## Ожидание

Следующий кадр на уменьшенном масштабе отображает финальное содержимое слоя.

## Факт

На следующем кадре `_downsampleTileInto` не вызывается: уменьшенная копия остаётся прежней. `bakeNetworkSnapshot`/full replay могут совпадать побайтно, хотя экранные пиксели различаются.

## Доказательство

Новая engine regression `index.watercolorCoarseSettle.test.ts`: первый zoom-out frame действительно выполняет fold, после `_completeSettle` следующий frame fold не делает. До исправления1FAIL (точка assertion32).

Связано с #691: два браузера SAME AMD GPU с одинаковыми3ops (pencil→eraser→WC) дают17–18/255 pixel diff после120sec; четыре snapshot SHA256 (incremental/fullReplay обоих) одинаковые. Минимальная причина stale coarse найдена отдельно и проверяется до фикса.

Среда: task branch agents/qa-2026-10-02, origin/main8990c479, QA HTTPS5288, Chrome151/154; physical Apple/Intel/AMD sustained run также активен. Samsung не использовался.

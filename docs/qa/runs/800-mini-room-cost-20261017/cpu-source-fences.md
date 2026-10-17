# #800: счётчик source fences, без GPU

База: `53ba23ee`. Тест `apps/web/src/engine/index.miniRoomFenceCount.test.ts`.
Один настоящий PencilEngine/MockGL64×64 на вариант, один и тот же front8-v4
preset/profile и10явных dab, один физический tile, budgetMs=0, обычный
continuationGpuFence=false, без активных Dry-clock. FIFO обслуживается вручную.
Это не проверка настоящего драйвера, времени, пикселей или PointerInput.

| asyncFinish | immediate yields | FIFO advances | source gl.finish | band draws |
|---|---:|---:|---:|---:|
| false | 58 | 0 | 0 | 28 |
| true | 0 | 68 | 68 | 28 |

Команда: `vitest run apps/web/src/engine/index.miniRoomFenceCount.test.ts --maxWorkers=1`.
Результат1/1PASS, последний запуск3.85s, само тело203ms. Машинные значения
в `source-fence-counts.json`. Числа относятся только к этому потоку, не ко
всему Mini/Room; дополнительный async-preview также не является бесплатным.

Подтверждённая цепочка: `index.ts:9349` `_advanceAsyncCanonical` вызывает
`_syncContinuationGpu` после каждого next, включая yield0 и done.
`index.ts:5174` при неактивном boundedDryClock и выключенном continuation-fence
вызывает gl.finish. Альтернативный `GpuBudgetFence.sync` — синхронный readPixels1×1,
не async fence. `dryGpuFenceBatch:8` сам по себе не включает активный Dry-clock.
Синхронный `_paintRibbonDabs` (`index.ts:8030`) дренирует generator без такого fence.

Нельзя приписывать каждому pointer batch полную копию всех tile planes:
`RibbonStrokeScratch.filmBuffers:581`/`solventFilm:680` делают fulltile base-copy
при смене material gesture, затем переиспользуют film. Каждый material batch
в `RibbonStrokePainter:1013` обходит пересекаемые tiles и перестраивает
solvent/P/C через fieldOp в revealRect (`1077`, `1210–1217`), плюс band/nib draws.
При cache miss managed texture может дополнительно синхронно evict/readPixels,
а затем hydrate/texSubImage2D (`AccumulationBuffer:106–149`). Это условная работа,
её фактическое число устанавливает device profile.

Mini подтверждён SHA served bundle `2fed32ad961d8dd78db4f7f54a82663a016e2ec93b0f07e72b0abcd68be542af`.
Его experimental morph/material ctor использует asyncFinish=false. Исходный
interactive adapter также имеет single1024tile и прямой GPU Native target;
Roomlarge имеет CPU immutable capture,1536windows, GPU→CPU material readback,
coarse/global reconstruction и physical outputs. Это самостоятельное различие
работы после UP, не только очереди нанесения. Доля каждой причины в700ms против
15–30s этим CPU тестом не измерена. Текущий Room M70 options mapper тоже задаёт
asyncFinish=false, поэтому утверждение о всех Room по настройкам v2 неверно.

В800 создана только ссылка node_modules на совместимые существующие728deps
(lockfile cmp идентичен), без копии. Тестовые процессы завершены, новые сервисы,
браузеры, GPU задачи отсутствуют. Живые728/798 исходники не изменялись.

Повтор использовал существующий `vitest.config.ts`800, без собственного alias.
`@grafetto/shared` разрешался в728`packages/shared/dist` через общий dependency
store. `diff -qr` shared/src800↔728 не нашёл отличий; lockfile идентичен.
Следовательно это scoped engine/FIFO/Painter comparison с совместимым shared,
а не доказательство самостоятельной полной сборки800. Для будущей полностью
локальной проверки можно задать Vite alias `@grafetto/shared`→800
`packages/shared/src/index.ts` во временном config, не менять общий store.
Созданная для запуска800ссылка node_modules удаляется после проверки.

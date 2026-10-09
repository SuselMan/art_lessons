# CPU модель перекрытия publication ACK

Модель использует настоящие `CanonicalRoomWatercolorExecutor.prepareSettle`, `finish`, `emitPrepared` и `publishCurrentToGl` с fake GPU queue. Sentinel values обозначают версии, не акварельные пиксели. Продуктовый Runtime, FIFO и GPU код не меняются.

Проверенный порядок: old finish → copy в отдельный private publication view → new source. После выполнения GPU очереди новый source изменил текущий field, а private view сохранил старую версию. Поздний GL import читает private view; owner retirement, retired view или более новая импортированная версия запрещают старую публикацию. Новый owner не может получить seed из GL, пока GL baseline отстаёт от native field.

Предположения модели, ещё не реализованные в продукте:

- Owner-local admission lane может принять source после old finish submission. Fake `central.isIdle=true` моделирует эту возможность, а не доказывает её в текущей FIFO.
- Private view отдельный для каждой публикации, не переиспользуется и живёт до ACK/import. Это новая GPU copy и память, цена не измерена.
- GPU queue сохраняет заданный порядок; old job dispose не уничтожает source или publication ресурсы.
- Publication version authority существует; fake bridge вводит её специально. Текущий продукт этого договора не получает из теста.
- Same owner/source имеет правильную canonical baseline. Для другого owner нужен отдельный native baseline lease; stale GL seed запрещён.

Три CPU теста проверяют snapshot/order, publication/owner invalidation и stale seed. Это не физическая/Q8 parity, не actual GPU COW, не разрешение early admission и не измеренный UX выигрыш. Возможное перекрытие относится только к ACK части ожидания после old finish, а не ко всему времени DOWN→submit.

## Не подключённая host factory

`PrivatePublicationFactory` создаёт максимум два отдельных canvas/context через настоящий `CanonicalRoomTileBridge`. Исходный shader, textureLoad, viewport по размеру canvas, draw(3), RGBA8/premultiplied configuration и существующий queue ACK не изменены. Один lease удерживается до `restoreCanvasPixels` и освобождается в finally, включая ACK/import ошибки. Dispose запрещает импорт/новые acquire, но не unconfigure активный canvas до завершения ACK. Третий одновременный lease отвергается, а не ждёт/создаёт новую очередь.

Логический лимит: каждый canvas 1024×1024×4 = 4 MiB; два = 8 MiB. Это не физический memory budget: количество swapchain textures, driver allocation и GL import memory неизвестны. Размеры больше 1024 отвергаются. Pool lifetime explicit dispose; retention двух canvas возможна до dispose. Device loss должен привести к ACK rejection или invalid current callback; отдельный timeout/owner lease предоставляется будущим caller.

Actual bridge fakeGPU tests проверяют независимые render destinations, source snapshot при ordered queue, ровно один existing ACK на публикацию, lease capacity/reuse, dispose/owner invalidation, ACK/import errors и single-use. GPU compile, orientation/hidden RGB parity и физическая memory неизвестны. Factory не подключена к Runtime, new-owner seed не предоставляется. Поздняя версия import остаётся обязанностью будущего immutable `current`/version authority; сам pool её не изобретает. Constructor exception cleanup текущего CanonicalRoomTileBridge не расширялось этой factory. Никакого разрешения early admission из этого helper нет.

## Standalone QA probe (ещё без устройства)

`runPrivatePublicationProbe` callable только DEV; импорт не запрашивает adapter/device. Caller предоставляет owned device/GL/exclusive canvas factory. Actual branch использует два private bridges, один raw source 64² и две actual AccumulationBuffer цели. Queue order: upload A → raw canvas render A → upload B → raw canvas render B. Оба existing ACK завершены до target.readPixels; hot Room/input отсутствует. Pattern содержит разные top/bottom, RGBA и ненулевой RGB при alpha=0. Schema показывает mismatchedBytes/hiddenRgbMismatches и independentEndpoints; никакой потери скрытого RGB нельзя считать acceptable.

Actual host branch проверен fakeGPU command-order тестом (real factory/bridge, fake target injection), плюс corpus guards. Default targetFactory остаётся actual GL AccumulationBuffer. CPU fake target проверяет только соглашение orientation, не actual browser canvas premultiplication. No hardware пока root не выделит новую allocation. На устройстве exact endpoint будет содержательным output-copy proof; пока GPU compile, errors/device loss, физический memory и actual GL orientation не доказаны. Значение existingAckCount=2 описывает исходный код двух bridge calls, не GPU profiler.

Probe ничего не делает с native source admission/new-owner seed и не относится к акварельной physics parity. Readbacks разрешены только в standalone probe, не в пользовательском рисовании. Ожидаемые1024logicalbudget factory не измеряются64²probe; физическая memory всегда null. Constructor failure/cleanup текущих GL/bridge constructors отдельно не исправляются этим QA hook.

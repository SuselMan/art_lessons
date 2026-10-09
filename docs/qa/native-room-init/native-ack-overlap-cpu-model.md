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

Связано с #774, но воспроизводится без proposed deferred/async applyLayer: два одновременных restore одной комнаты/engine допускают регрессию изображения к старому snapshot.

CPU repro через публичные `restoreRoomState` → `restoreLatestSnapshot`, реальные `compressLayerTiles`/gunzip/decode и настоящий `PencilEngine.restoreLayerFromSnapshot` (MockGL):

1. Старый catchup получает index seq10, его blob10 задержан deferred Promise.
2. Новый catchup того же engine получает index/blob seq20 и полностью заканчивается. В sink установлены RGBA bytes red202.
3. Blob10 освобождён. Старый restore тоже полностью завершается.
4. Порядок фактических вызовов engine.restoreLayerFromSnapshot — `[20,10]`; последние переданные decoded RGBA стали red41. latestKnownSeq при этом20, setRestoreFailure не вызывался.

Ожидается: устаревший restore после нового не вызывает begin/apply/restoreHistory и не откатывает слой/coverage/CP; отменённая итерация не декодирует следующие слои.

Строгие границы доказательства: это CPU transport/control-path proof с настоящим gzip и exact decoded bytes на входе actual engine install. Это НЕ аппаратный GPU frame/pixel proof. Отдельная начальная попытка readLayerPixels была отвергнута как непоказательная для MockGL display state; итоговая регрессия проверяет decoded bytes/порядок установки. Финальная assertion сохранения202 действительно падает с полученным41, проверено обычным failing test до it.fails.

Источник snapshotRestore.ts SHA2567a5ae8b19bacbb8beef76673fff6bce2841efb41e470d069979a6f31c7f51451, restoreRoomState.ts708b9499f2b5333ba5a3cbd3c29f5421aefaf7738eab78c7d39aa6be6f6a0a06; файлы совпали с integration при проверке. Никакие runtime source изменения для baseline не требовались.

Минимальный общий design с #774: owner/generation одного engine с проверкой актуальности перед begin/decode/apply и после await; singleflight до inflate сохраняет #467 один decoded layer, pending apply при отмене settle/releaseviews. Не добавлять произвольный64MiB decoded cache. Исправление координируется с владельцем #774, параллельного runtimefix нет.

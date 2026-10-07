# #728: повторные попытки снимка пустого слоя

База: `8162113b`. Изолированная ветка `agents/728-empty-snapshot-retry`.
Принцип `cross-device-determinism`: Operation Log, watermark, физические проходы и
серверный формат снимков не меняются. Изменяется повторное чтение уже проверенных
пикселей, а не факт публикации.

## Причина и границы

В Samsung-прогоне 1417 после высушивания чистой воды зафиксированы 20 попыток
`bakeNetworkSnapshot` и 109 `readPixels` (это общий счётчик, включая конечный export).
Пустой снимок не публикуется и слой остаётся dirty. Bootstrap повторяет попытку
каждую секунду; неизменные прозрачные resident tiles снова читаются с GPU.

Эти чтения начались после исходной паузы около секунды. Исправление уменьшает
повторную работу, но не объясняет и не обещает устранить первоначальный hitch.
Исходный отчёт: `728-gpu-budget-fence/temp/fence-hardware/native-room-currentpureattribution_1791355929500/report.json`.

## Три результата попытки

- Отложенная/отказанная: quiet, authoritative-prefix или settled guard не прошёл.
  Не кэшируется, публикации и покрытия нет.
- Материализованная: есть непрозрачные tiles. Прежние байты, markPublished и
  upload/retry остаются прежними.
- Подтверждённо пустая: все guards прошли, реальное чтение не нашло tiles с alpha.
  WeakMap сохраняет identity слоя и pixel revision. Следующая попытка проверяет
  guards снова, но не читает те же пиксели.

Revision читается после `settled`, который может выполнить repair и markDirty.
Каждый markDirty меняет revision независимо от published/coverage. Restore явно
удаляет старое наблюдение; context restore создаёт новый layer buffer. WeakMap
не удерживает уничтоженный GPU owner. Никакого empty upload, искусственного
published seq или изменения покрытия нет. Bootstrap может продолжать дешёвые
проверки каждую секунду — это необходимо для будущей краски и изменения guards.

## Проверка

59 тестов в четырёх файлах PASS: реальные Engine buffers/readPixels,
SnapshotLedger, существующие dirty mutation paths и Room snapshot uploader.
Проверено первое чтение/повтор без чтения, отказ без кэша, изменение после
наблюдения, restore в тот же слой, context rebuild, независимость слоёв,
реальный clear/repaint, side-effect settled до revision и двадцать bootstrap попыток без HTTP с
последующей публикацией новой краски на новом watermark.

Whole-web TypeScript PASS в отдельном локальном mirror с существующими
зависимостями; oxlint --fix и diff --check PASS. map:check покрывает 994 файла; map:rules — 0 ошибок, 5 существующих предупреждений. Логи `temp/qa/` сохранены.
Это CPU/MockGL проверка исправления; новый аппаратный FPS/полный readback timing
после изменения не измерялся. Стенды и устройства в этом задании не изменялись.

## Интеграция в ночную ветку

Production-кандидат интегрирован как `1840f311`. Whole-web TypeScript PASS,
Room snapshotSync30PASS. Первый полный engine прогон:1702PASS/16skip/2FAIL —
два старых snapshotRegion fixtures использовали неполный fake ledger без нового
getter. В `19d2720c` они заменены настоящим SnapshotLedger. Повторные focused
region+empty проверки:13PASS; полная suite повторно запущена.

Architecture map994files/68modules PASS; dependency rules0errors/5existing
warnings/11knownignored. Логи: `temp/night-728/{full-engine-empty-cache,
full-engine-empty-cache-retry,empty-region-retry,empty-uploader,
web-empty-cache-types,map-empty-cache,map-empty-cache-rules}.log`.

Аппаратный gate отдельно выполняется на immutable1840, Samsung, настоящая
комната640×480. Его частичный результат не считается полным восстановлением:
новая краска/upload/fresh join ещё должны быть проверены. Пользовательский
стенд5329 по-прежнему d88; задержка первоначального растекания не закрыта.

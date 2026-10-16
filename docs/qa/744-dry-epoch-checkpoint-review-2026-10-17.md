# #744: узкий корректный dry-epoch checkpoint

Read-only предложение, код index.ts/CheckpointStore не менялся. Мокрые snapshots
и изменения solver не нужны. Сначала ограничить оптимизацию новым/полностью
известным слоем без непрозрачного network snapshot base (`!hasCoverage(layerId)`).
Иначе fingerprint доступной части журнала не доказывает неизменность неизвестных
пикселей базы. Старый путь snapshot repair продолжает работать отдельно.

## Два места реализации

### 1. CheckpointStore: доказательство закрытой эпохи

У ordinary checkpoint добавить два отдельных локальных поля:

- `canonicalValid?: () => boolean` — проверяет effective material prefix;
- `closedWashIds?: readonly string[]` — М70 wash IDs, закрытые настоящей сушкой.

`best()` и `startOf()` сначала вызывают canonicalValid. Если доказательство
недействительно — cp непригоден. Только при успешном доказательстве разрешается
не считать `closedWashIds` пересечением открытого wash в crossesWash. Это НЕ
`washIds`: последние означают перенесённый сырой мокрый source, которого тут нет.
Если есть closedWashIds без валидатора — отказ по умолчанию.

### 2. Index: создание, использование, invalidation

После завершения записанной `paper_dry` целевой слой должен уже содержать goal,
а controller — отпустить source. Можно воспользоваться существующим `released`
callback: найти target только среди актуальных root layer buffers и запланировать
idle `_takeCheckpoint`. Перед взятием повторно проверить обычные guards, отсутствие
controller source и то, что последняя активная recorded dry идёт ПОСЛЕ последнего
эффективного М70-мазка слоя. Callback не означает сам по себе успешную сушку:
forget также вызывается при rebuild/context-loss; guards и проверка записанной
границы обязательны. Ещё лучше явный callback root после canonical close, если
он уже вводится для других исправлений.

При создании сохранить canonical material prefix до последнего включённого
события слоя и ID активной границы сушки. Валидатор проверяет:

- конечное событие и dry boundary по-прежнему существуют в effective истории;
- порядок и состав material prefix совпадают;
- stroke token включает id/tool/preset/color/timestamp/wet/strokeId/washId и
  геометрию (`dabsPacked` по значению либо immutable dabs reference);
- обычные immutable операции сравниваются по оригинальному ID, но активные
  границы сушки тоже входят в prefix, а не теряются из pixel-only списка.

Undo/redo/revoke meta сами не являются материалом: их эффект уже отражён в
составе effective операций. Новая отмена более позднего мазка не портит prefix;
отмена пигмента под старым тем же ID, исчезновение защищённой воды, удаление dry
или server reorder перед checkpoint делают proof недействительным.

В `_applyHistoryChange` НЕ удалять прошедший canonicalValid dry checkpoint.
Старые checkpoints без proof пока инвалидировать как раньше. Это нужно сделать
в обоих местах текущей invalidation, включая отдельный цикл paper_dry; иначе
второй цикл снова удалит сохранённый cp. kernel `best/startOf` остаётся последней
проверкой, даже если eager invalidation пропущена.

## Проверки до включения

1. A → dry → B → undo B: cp используется, результат равен full replay.
2. A → dry → B → undo A: proof отвергается; результат равен full replay.
3. Water-only проекция с тем же ID меняет preset: cp отвергается.
4. Undo dry при том же списке stroke IDs: cp отвергается.
5. Foreign undo снимает защиту более ранней воды: cp с этой водой отвергается.
6. Server reorder/late history перед endpoint: cp отвергается.
7. Повторение `washId=m70:<layer>` после настоящей dry не блокирует безопасный cp.
8. Controller forget при отмене/rebuild не создаёт cp с промежуточными пикселями.

Это два затронутых файла, но не две однострочные правки: нужны proof, callback
и selective invalidation. Поэтому предложение оставлено для root, без попытки
обойти текущие проверки wash или выдать сухие пиксели за мокрый source.

# #728: следующее касание при незавершённом предыдущем wash

CPU-разбор, 07.10.2026. Это проект диагностического пути, не реализованный фикс и не аппаратное доказательство. Пользовательские стенды не менялись. Фактический Samsung census показывал joinedTouch=false; причину задержки именно при ON ещё надо измерить.

Принцип: старый физический оператор сохраняет своего владельца до окончательного composite. Новый реальный deposit использует отдельный scratch; старый land не получает права перезаписать его. Один будущий мазок, без async/material presentation и без изменения solver.

## Почему нельзя просто расширить admission

`Engine._paintDabs` включает recorder только при `settle.scratch === ribbonScratch`. Новый wash получает другой scratch; `RibbonStrokeScratch.getOrCreate` копирует текущий tile в original. Этот tile ещё не является завершённой базой предыдущего wash. Старый Plan.finish делает land, а engine затем рисует старый composite поверх нового deposit. Удержание scratch от destroy само по себе не устраняет потерю нового материала.

При смене слоя `setActiveLayer` вызывает `_clearWash`, который синхронно complete и retire. Убирать complete без отдельного старого владельца нельзя: old job продолжает читать его буферы. Новый слой не конфликтует по tile, но общие fieldCache и complete callback всё ещё принадлежат старому заданию.

## Минимальная следующая ступень

1. Взять immutable old finish до смены preset/color/layer. Lease хранит job identity, scratch, target layer и epoch. Не переиспользовать будущий scratch для старого solver.
2. Создать один future scratch. Настоящий native source рисуется сейчас; лог, wet bytes и sample times остаются обычными. Старый callback пока не уничтожает owner.
3. До первого будущего source начать отдельный bounded command capture. Сохранить порядок, копии vertex/uniform arrays и references только на удерживаемые текстуры. Нельзя считать scalar-copy равным immutable sampler content.
4. После старого Plan.finish **и старого engine composite**, при том же epoch, обновить future.original из завершённого canonical tile. Для другого слоя это обновление не требуется, но owner barrier всё равно нужен.
5. Восстановить будущие source accumulators и выполнить записанные команды один раз, затем пересчитать actual composite. Future Plan.prepare возможен лишь после этого. UP пока честно сохраняет барьер. Третье касание использует прежний complete fallback.
6. Освободить старый scratch после callback и source rebase. При loss забывать GL references, не освобождать их через новый контекст. Экспорт/checkpoint/bake/network snapshot не публикуют незавершённую lease. Undo/clear/remove отменяют физический owner и восстанавливают accepted journal, а не теряют операции.

## Ещё не закрытые зависимости

Recorder sourceNib/sourceBands/sourceField не покрывает `importForeignWater`: там есть direct fieldOp, временные donor scratch, copyTo и clear. После возврата donor уже уничтожен. Поэтому replay только существующего runningSourceCommands для water→pigment нового wash недостаточен. Нужен отдельно удержанный foreign-water import либо повтор импорта из immutable recorded chunks до source replay, с прежним порядком и dedup semantics. Нельзя записать callback на освобождённый temp.

Новый wash начинается с нулевыми ink/color/coverage, но импортированная coverage/V является базой source. Полный clear перед replay уничтожит её; clear только stroke films тоже не восстановит ошибочно захваченную original. Reset должен воспроизвести точное состояние после import и до первого dab. Старый PaperWet commit выполняется на UP, поэтому sampler chronology нельзя заменить временем окончания solver.

Флаг mixed finish меняет finish branch и metadata capture. Его включение для new-wash требует отдельного no-overlap контроля; нельзя считать прежний same-scratch gate доказательством этого пути.

## Обязательные доказательства перед runtime wiring

- CPU: old callback composite → future original update → import → source replay → future prepare, без повторного deposit; stale identity/epoch callback ничего не меняет.
- CPU: natural completion, third gesture, layer switch, export/bake/checkpoint, loss/destroy и Undo сохраняют owners и accepted IDs; unknown sampler lifetime отказывает admission.
- CPU: обычный OFF и no-overlap трассы не меняются; immutable finish color/dryCtx/paints не ссылается на текущие настройки.
- GPU отдельно: один fixed tape OFF/ON, same layer new wash water→pigment и RGB; полные P/C/V/coverage и wet/time bytes, затем Dry/Undo/Redo/fresh. Другой слой — отдельный контроль. Непустые endpoints обязательны.
- Latency отдельно: реальные first pigment pixels после DOWN без тяжёлого readback во время input. Барьер на UP и ограничения одного future owner фиксировать явно.

До закрытия foreign-import/reset зависимости безопасный runtime кандидат не готов. Это не повод включать сломанную provisional presentation или менять физику.

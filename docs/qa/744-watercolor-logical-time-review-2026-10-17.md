# M70: время естественной сушки — аудит, не исправление

Дата: 17.10.2026. Связано с #744/#745. Проверка исходников и исполняемые controller/FakeClock findings. GPU и production-логика времени не менялись.

## Подтверждённое расхождение условий

- Live передаёт `Date.now()` в `source()` при DOWN: [index.ts](../../apps/web/src/engine/index.ts#L6235).
- Операция получает `timestamp: Date.now()` при UP и при записи чанка: [UP](../../apps/web/src/engine/index.ts#L6656), [chunk](../../apps/web/src/engine/index.ts#L7105).
- Replay передаёт в `source()` записанный timestamp: [replay](../../apps/web/src/engine/index.ts#L7429).
- Controller проверяет `newTimestamp >= previousTimestamp + 120000` **до** проверки идентичности жеста, затем заменяет timestamp: [source](../../apps/web/src/engine/src/watercolor/puddle/PuddleRoomController.ts#L94).
- Resolver использует последовательные записанные timestamps: [watercolorUndo.ts](../../apps/web/src/engine/src/oplog/watercolorUndo.ts#L192).

Следовательно, одинаковая геометрия может выбрать разные ветки wet/dry в live и replay. Это доказано чтением условий; конкретное пиксельное расхождение этими сценариями пока не измерено. Это не только продуктовый выбор длительности анимации.

## Два минимальных FakeClock-сценария

Все времена — секунды от одного ненулевого epoch T. Один слой, два разных M70-жеста с пересекающимися footprints, без explicit Dry и без других событий. Сравнивать canonical goal до/после full replay, а не экран анимации. Spy `close(target)` фиксирует ветку независимо от GPU.

| Сценарий | Действия | Live условие | Replay условие |
| --- | --- | --- | --- |
| Поздний UP нового жеста | A: DOWN=UP=0. B: DOWN=119, UP=121 | 119−0<120: общая вода | 121−0≥120: A сушится перед B |
| Длительность предыдущего жеста | A: DOWN=0, UP=10. B: DOWN=125, UP=126 | 125−0≥120: A сушится перед B | 126−10<120: общая вода |

Для spy не вызывать structural canonical read между шагами: он сам может закончить target и исказить наблюдение. После UP сначала снять число boundary-close и epoch, затем сравнить материал.

## Предлагаемый проверяемый контракт

Продуктовый вопрос: считать ли непрерывное удержание пера активностью без движения? До ответа разумный ограниченный кандидат — время последнего реально принятого материала, UP завершает эту активность. Это предложение, не принятое новое правило.

1. Новый жест сравнивает **записанный start** с **последним touch/end предыдущего материала слоя**. Равенство 120000 ms — сухая граница.
2. Продолжение того же жеста по `strokeId` не закрывает его собственную воду из-за деления на chunks. Explicit Dry/hide остаются отдельными журналируемыми границами и имеют приоритет.
3. Последняя активность/UP продлевает жизнь материала. Один start timestamp на весь 180-секундный мазок непригоден: следующий мазок через секунду после UP не должен автоматически читать его как давно сухой.
4. Состояние строится по original journal order, независимо от RAF, времени replay и устройства. Старые операции без новых полей сохраняют прежний fallback `timestamp`, иначе старые комнаты будут перерисованы.
5. Clock skew между авторами контракт сам по себе не устраняет. Нужна явно выбранная шкала времени (уже синхронизированная или серверная), и одинаковая нормализация у live/peer/replay; нельзя просто применить локальный Date.now только у наблюдателя.

## Ширина возможного исправления

Это ограниченная, но сквозная правка; одной строки controller недостаточно.

- Shared `StrokeOperation`: optional gesture-start поле; существующий timestamp можно оставить end/touch для совместимости. При chunks start одинаковый, end/touch меняется; не подменять смысл общего OperationBase.timestamp для остальных инструментов. Отдельное lastTouch поле нужно только если решено отличать UP без движения от реального внесения воды.
- Shared `StrokeLiveData` сейчас не несёт authoritative timestamps: [protocol.ts](../../packages/shared/src/protocol.ts#L114). Для правильного peer-preview до commit нужны start и touch в авторской шкале либо обязательная canonical repair после записи. Сервер пересылает packet spread, но stand-in timestamp=0 используется только для permission gate: [socketHandlers.ts](../../apps/server/src/rooms/socketHandlers.ts#L657).
- Local input: сохранить wall-clock start один раз, прикладывать к каждому chunk/UP; обновлять controller lastTouch на принятом материале/commit. Привязать монотонный input clock к wall-clock один раз, а не смешивать event.timeStamp с Date.now.
- Controller: отдельно start для expiry-test и end/touch для нового состояния; continuation проверяется прежде естественной границы, но не прежде explicit recorded boundary. Prewarm не должен изображать реальную активность.
- Peer input: передавать время packet в source/touch; финальная операция и server order должны корректировать оптимистический источник. Жест, начавшийся до peer Dry и записанный после него, требует существующего mid-pen rebuild; start не может отменить explicit Dry.
- Replay, resolver и historicalPrefix: одинаковая пара start/end и whole-gesture continuation; undo/redo retained-water должны видеть те же эпохи. Snapshot/serialization нужно проверить на сохранность optional fields при roundtrip, копировании и import/export; packed dabs не менять.
- Проверки: два сценария выше; 180s непрерывный жест с chunks и следующий через1s; chunk после120s без изменения strokeId; explicit Dry посередине; peer clocks ±2min; cold rejoin; legacy без поля. Нужны meaningful unit tests и одна hardware-пара canonical/replay, прежде чем считать проблему исправленной.

## Вкладки и анимация: отдельная семантика

[frame](../../apps/web/src/engine/src/watercolor/puddle/PuddleRoomController.ts#L190) считает морфинг от solver completion; окончание естественной анимации не освобождает source. Его закрывает следующее логическое действие. [snapshotQuiet](../../apps/web/src/engine/index.ts#L5700) запрещает публикацию такого активного source. Скрытая вкладка может задержать RAF explicit Dry и очередь следующих операций; это вопрос задержки, пока не доказано расхождение материала. Нужный hardware case: background observer → peer Dry → следующий мазок → foreground → очередь опустела, target совпал, смешивания через Dry нет.


## Исполняемая проверка #753, 17.10.2026

Три finding-теста в `PuddleRoomController.test.ts` воспроизводят обе противоположные ветки из таблицы и split одного strokeId при разрыве между source-вызовами 180 секунд. Controller suite: 14 тестов PASS. Они фиксируют legacy v1 поведение, не объявляют его желаемым и не включают новую семантику.

Важное уточнение: сравнивается gap между соседними source-вызовами. Непрерывный жест длительностью 180 секунд с частыми чанками сам по себе не разрывается в replay. Same-gesture gap>120 секунд означает долгую паузу между chunk-событиями; вопрос высыхания под неподвижным пером ещё продуктовый. Отдельная подтверждённая проблема live: source создаётся на DOWN и lastTouch не обновляется на UP, поэтому следующий жест может видеть возраст от давнего DOWN, хотя replay видит поздний timestamp последнего chunk/UP.

Молчаливое исключение same-strokeId из expiry поменяло бы старые журналы `m70-r2-v1`; оно не внесено. Безопасная будущая правка требует записанного и версионированного контракта start/lastTouch/end, одинакового у live, peer, replay и resolver, с legacy fallback. Неактивный opt-in API также не добавлялся.

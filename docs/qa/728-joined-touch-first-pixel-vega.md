# #728: один joined touch, физический first-pigment контроль Vega

Кандидат5e80b919, immutable отдельный5330. Две обычные комнаты Fine1754×2480;
кисть400, exact normal:100:100:PB29:round и RGB [.22,0,.6]. Async/material/
lazy/split/front/contact/presentation/band ускорения выключены.
Единственное отличие — diagnostic joinedTouch=false/true ДО первого job.

Два фиксированных native `_onStart/Move/End` жеста, одинаковые samples,
записанное dab time, stroke seed и crypto seed; между первым UP и следующим
DOWN нет rAF. Предыдущий job314units/next1. Это логический input тест,
не OS pen timestamp и не измерение browser presentation/FPS.

| Второй DOWN | OFF | ON |
|---|---:|---:|
| CPU return | 9.7ms | 8.0ms |
| После-DOWN5×5 GPU read wait | 536.9ms | 2.2ms |
| Пигмент-ready upper bound | 546.8ms | 10.2ms |
| Следующий UP CPU | 56.8ms | 52.5ms |

Во всех onset ROI25/25 изменившихся фиолетовых pixels. Before-DOWN ROI
readback завершает ранее отправленные GPU-команды: этот опыт изолирует burst,
добавленный самим DOWN, но не включает возможную ранее накопленную GPU-очередь.
Обязателен отдельный realistic no-baseline-read-before-hot контроль.

24полных scratch/solver buffers побитно совпали по SHA256 и размерам;
P/C/solvent/coverage содержат ненулевые данные. Solver cache — диагностические
временные поля, их не называем новым публичным состоянием. WholeRGBA SHA
совпадает, purple287989, GL0/lostfalse. Material operation oracle нормализует
только id/userId/layerId/outer timestamp/server seq; preset/RGB/wet/dabsPacked
(включая dab time)/strokeId/washId сохранены и совпадают: namedDiffPaths[].

Контроллер41114 EXIT0, собственный Chrome закрыт. Private raw:
`temp/band-room/joined-fixed-result.json`; полный source passport и HOME originals
сохранены в `680-lifetime-hardware/temp/joined-touch-5e80b919/`.

Это ограниченный одноцветный/однопресетный physical parity PASS. UI Dry/UndoRedo/
fresh rejoin, live job completion/loss, иной preset/RGB и другие устройства
ещё не дают product-safety PASS. Пен-UP barrier сохранён. Ранее70f4c5bb имел
mutable-metadata guard holes; его provisional результат не разрешал включение.

## Typed constructor UI lifecycle, источник049af326

Отдельный обычный Room qaJoinedTouch=1: constructor-флаг проверен до input.
Engine author не `local`, совпадает с roomStore author перед жестами.
UI Dry seq3: purple287989; Undo seq4 действительно пометил stroke2 undone,
purple252213 и другой wholeSHA; Redo seq5 вернул stroke2 done, purple287989
и исходный wholeSHA. Все stroke server ACK seq1/2, GL0/lostfalse.

Контроллер55712 завершён EXIT1/CLOSED при fresh join: форма получила
`server_busy`, новый Engine не создан. Поэтому полного fresh-restore PASS нет.
UI строка говорит capacity, однако сервер использует тот же error и для
исключения prepareSnapshotReplay; по UI причину не классифицируем.
Private raw: `temp/band-room/joined-typed-lifecycle-result.json`.
Первичная попытка35817 остановилась RAM guard до Chrome; тестов не было.


## Исправление контроллера и полный typed lifecycle

Причина прежнего fresh join отказа установлена: глобальная подмена
crypto.getRandomValues в тесте повторяла Operation.id между собственными
комнатами. Prisma P2002 оставил в прежней комнате только Dry/Undo/Redo,
без их stroke-зависимостей. Это ошибка контроллера, не capacity и не
регрессия кандидата. Подмена удалена; фиксируются только физический strokeId
и логический washId, operation IDs создаются настоящим nanoid.

Повтор 80355 завершился до ввода на пустом create DOM. После восьми HTTP200
проверок модулей, проверки Vite log и RAM≈1919MiB выполнен один контролируемый
повтор62736. Он завершился EXIT0/CLOSED, источник049af326 неизменён.
Новая комната qcpp4SdG: настоящий author совпал с store; constructor joinedTouch
true до первого job. Перед fresh join HTTP API, читающий DB, подтвердил ровно
пять уникальных операций seq1..5, включая обе stroke-зависимости.

Dry, Redo и свежий вход побитно совпали по wholeRGBA SHA
08136423df3b0882715e1d08619733b251a80e0085bcdb87fb33b13e84491829,
purple287989. Undo действительно отменил второй stroke: purple252213,
SHA4cd684e07535d0ebb3ffb32adb766276f0bdb929c1cd728dc98e8a58d5eb5280.
GL0/lostfalse во всех стадиях. Raw:
`temp/band-room/joined-typed-lifecycle-unique-pass.json`.

Hot DOWN: CPU2.3ms, после него GPU-read верхняя граница4.1ms,
25 изменённых pigment pixels. Предварительный baseline read синхронизирует
старую GPU очередь: это изолированная стоимость нового DOWN, не полная
аппаратная задержка пера. Несинхронизированный вариант ещё не проверен.
Сфера PASS узкая: одинаковые RGB и exact preset, обычный Room с двумя
фиксированными жестами, Dry/Undo/Redo и свежий вход. Не broad FPS PASS.


## Surface: парный first-pigment admission probe

Контроллер94494 EXIT0/CLOSED, отдельный интерактивный Chrome QA profile.
Исходник049af326: все1005 raw SHA совпали с immutable manifest до arms.
Ordinary Room OFF/ON, только typed joinedTouch изменён; async/material/
lazy/split/front/contact/presentation/band выключены. Actor настоящий,
совпадает со store. Global crypto не изменён, физические stroke seeds и
логические event timestamps фиксированы. HTTP DB200 после каждого arm
подтвердил три уникальных stroke и Dry, seq1..4, собственные room0ECt3uhY
и IbKxE2g8; предыдущие журналы не менялись.

Hot OFF: previous job next10/92, completeSettle1, lease false; CPU15.6ms,
GPU read579.3ms, real-pigment upperbound595.1ms. ON: previous8/92,
completeSettle0, старый job сохранён и joined lease равен именно этому job;
CPU8.8ms, read28.3ms, upperbound37.1ms. Cold39.2/33.5ms,
afterDry16.1/15.6ms. Все ROI changed25/purple25, GL0/lostfalse.
Пассивные wrappers сохраняют this/args/return, дополнительных barriers
кроме диагностических5×5 baseline/postDOWN reads не добавляют.

Это подтверждает admission и устранение синхронного drain в узком preset/RGB
сценарии. Baseline read предварительно синхронизирует старую GPU очередь;
метрика не browser-present или аппаратное перо. Предшествующий rAF next
слегка различен, whole dry parity данным прогоном не измерена.
Raw `temp/band-room/first-pixel-surface-1791384149972.json`, source proof
`temp/band-room/surface-pair-source-proof.json`.
Exact owned Chrome9844, task и SSH forward2488762 закрыты; профиль сохранён.
User5330/qcpp4SdG/5329/5339 не изменены.

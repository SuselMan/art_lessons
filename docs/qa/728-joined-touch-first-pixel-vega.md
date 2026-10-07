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

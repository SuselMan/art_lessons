# GL: текущий итог доказательств

Это локальные кандидаты #728 (плавная акварель), не production готовность и не обещание устранения задержки пера.

| Направление | Проверено | Решение/ограничение |
|---|---|---|
| Boot страницы создания | Отделение authoritative tool constants от engine barrel; Surface form появился до загрузки engine graph | Narrow refactor PASS; colddev всё ещё18.86s доform, это не скорость комнаты/рисования |
| Mixed lease +queued history | Ранее exact immutable material/history, actual Undo/Redo/Dry/leave/rejoin, source ownership и FIFO repairs | Пользовательский стенд5381 остаётся прежним, новые CPU кандидаты в него не добавлены; UX ещё требует живой оценки |
| Contact hoist | Actual Surface10fields+whole+30 ordered upload bytes exact; producer0→28 | Natural UP mixed: первый101→79ms, второй76→100ms; defaultsOFF |
| Matched hoist CPU | Настоящий private payload/fullidentity/30hash; warm около6–7% | Малый выигрыш, не решение общего onset/UP |
| Column/row Float64 memo | 100edge cases+same30 bytes; warm6–10% в CPU | CPU-only prototype, runtime не wired, cold шумно |
| Contact/stencil split | Actual samewash2op: contact20.60ms/grouping0.1175ms/emptyforeign negligible | Foreign upload0; nonempty чужой stencil не измерен, чужие76ms не приписываются этой ленте |
| Existing GL2 brush MRT | Ранее Surface Room/parity и synthetic operator≈40%; whole≈2.25% | Current safety maintenance9814, CPU12+TS PASS; текущая сборка с новым lease/history аппаратно не проверена; GL1 MRT route отсутствует |
| Worker/WASM | Source feasibility: contact worker отсутствует; existing worker только snapshot transport | Ownership/FIFO/cancellation нужны, перенос CPU сUP не бесплатный; реализация не начиналась |

Новых frontend/device ресурсов нет. Защищённый manual5381/user room не перезагружались. Все private payload fixtures остаются вне Git; compact provenance/sourceSHA сохранены. Новые commits только локальные, без push/main/deploy.

## Точные повторы Math.exp в настоящем payload

`contact-real-tape-cpu.mts` с `QA_CONTACT_EXP_CENSUS=1` вычисляет именно исходный `-length / ry * water * (1-r2)` и сравнивает Float64 bit pattern (включая signed zero). Никакой exp approximation/recurrence/reassociation. Внутренние Sets используются только offline census, producer не меняется.

28 реальных вычисленных contact fields (не30 upload: два seed upload повторяют готовое поле),335780 exp calls. При отдельном cache на каждый group:34.89% повторов; отдельном на stroke:42.88%. Глобально71.44%, но два strokes имеют одинаковые contact inputs: это повтор сценария, который завышает пользу долгоживущего cache. Два groups каждого stroke вообще не имеют повторов; максимум group около63%. Actual fullinput identity и30flowhash PASS.

Hit rate не доказательство ускорения. Float64 bit extraction/Map lookup/hash/alloc и объём95k unique keys могут превысить цену native Math.exp, а глобальный cache удерживает историю и не имеет пока lifecycle/budget. Поэтому runtime memo не добавлен и performance benchmark не запускался. Compact `contact-exp-bits-summary.json` содержит group counts/source/fixtureSHA без raw arguments/operations. Если выбирать следующий кандидат, только bounded per-group CPU prototype с неизменным original fallback и exact byte gate; сначала доказать экономию, не обещать её по проценту попаданий.

Плавность пока не достигнута: выигрыши отдельных CPU/GPU kernels не означают быстрый critical path до первого пигмента, а перенос finish наUP может увеличить паузу после отрыва. Рабочее направление остаётся точное сокращение обязательного source/publication work с сохранением material ownership и серверного порядка.

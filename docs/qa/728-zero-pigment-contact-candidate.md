# #728: opt-in zero P/C contact candidate

Основа436b2c1c/e8af6155. `_wcZeroPigmentContacts=false` по умолчанию; это исследовательский кандидат, не изменение принятой модели/production.

Принцип: только доказанно нулевой pigment operator можно пропустить. Fresh scratch начинает с очищенных P/C; любой pigment/legacy source делает provenance unknown до рисования. Park/checkpoint restore всегда unknown, новый формат хранения не добавлен. Gate проверяет done/pending pixel writes полного журнала, live pigment и snapshot coverage. Snapshot unknown запрещён даже при наличии старого clear в backfill: без coveredSeq доказательства это не разрешение. На известном пустом слое активный clear сбрасывает историю; Undo/revoke clear возвращает старую краску и закрывает gate. Rebuild в fresh target, не вошедший ещё в `_layers`, также conservative slow.

Изменён только выбор contacts в WatercolorSettlePlan: пустой contacts список исключает flow upload и brushPass/pulse copies. V/coverage/front/land/PaperWet/film/wash/canonical operators остаются прежними. Source metadata не влияет на обычный default-OFF путь; весь history scan также short-circuited при OFF.

CPU:25 targeted tests PASS (proof gate + coupled settle + auxiliary source/resource lifecycle), реальные web app/sw typecheck PASS, workspace lint PASS с прежними предупреждениями; mapcheck67модулей949файлов PASS; maprules0ошибок/4старыхпредупреждения. MockGL проверяет сохранённый front count и исключённые contact draws, не заявляет GLSL pixel equality.

Vega hardware, один собственный Chrome/engine за раз, Fine640×480, фиксированные одинаковые журналы: water80, water400, чужая wash water→pigment, painted-layer negative. Это deterministic append fixtures с заданными wet metadata; не actual native pen benchmark.

Во всех4 парах OFF/ON полные SHA resident P/C/coverage/V (и foreign V когда присутствует) совпали после каждого settle. Pure-water P/C целиком нулевые, coverage/V ненулевые. Все phase PNG, последующий непустой pigment/Dry/full rebuild совпадают exactly; в каждом endpoint Dry==rebuild. GL0/contextLost=false, actual AMD Radeon/radeonsi. Water80 исключил98 brushPass calls и98 связанных copies, water40096+96; subsequent pigment и painted-layer остались slow. Это число операторов, не доказанное hardware speedup; timings с readback/capture инструментами не являются чистым latency benchmark.

RawHOME `680-water-wet-tone-qa/temp/history-parity/zero-contact/`, предварительный вариант сохранён `zero-contact-pre-shortcircuit/`. Полные PNG/SHA/операции/report сохранены; собственный Chrome закрыт finally. VPS `temp/history-parity/zero-contact-report.json`, `zero-source-{vps,home}.txt`; все5runtime SHA HOME/VPS совпадают. Controller `temp/history-parity/zero-{review.html,run.mjs}`. Protected5314 и пользовательские комнаты не менялись.

Ограничения: история сканируется только при opt-in, кеша пока нет; старый/covered/carried state сознательно даёт false negatives. Carry/diffusion/tide проходы пока НЕ оптимизированы. Actual Samsung warm performance/dense400 и native multisession/negative-controls понадобятся до default ON.

## Samsung: warm balanced latency

Собственная unique5316 вкладка1249 на actual Adreno650, один engine, Fine физический640×480. Тот же fixed journal внутри каждой OFF/ON/OFF тройки; первый400 проход только warmup. Тайминговый режим не делал material readback внутри settle. Измеряется append→idle первого water operation, включая его deposition и settle, затем обычные последующий pigment/Dry/rebuild.

| Сценарий | OFF1 | ON | OFF2 |
|---|---:|---:|---:|
| straight water400 |2389.7мс|1513.0мс|2333.5мс|
| dense water400 |12961.7мс|1524.8мс|12776.3мс|
| water over painted layer (negative) |591.4мс|591.3мс|634.1мс|

Straight улучшился примерно36%, dense88% относительно среднего двух OFF. Painted-layer gate=false и операторы не исключены. Dense исключил1316 brushPass calls и1316 связных copies в первом водяном settle; straight96+96. Последующий пигмент остаётся slow. Whole phase PNG/Dry/rebuild в каждой тройке EXACT, конечный Dry непустой, GL0/lostfalse во всех12 запусках. Это не native pointer FPS, не fullA4/многопользовательский/performance soak.

Отдельная нетайминговая foreign-water→pigment OFF/ON пара дала полные SHA P/C/V/coverage EXACT. В timed dense проходе поля намеренно не читались: там только whole endpoint PNG equality, не отдельный dense field SHA claim. Actual runtime пяти файлов соответствует проверенному коммиту0e0cbe77 по SHA; shader не менялся, cold-salt compilation не заявляется.

Raw VPS `temp/device-runs/samsung728-zero-contact.json` + `samsung-zero-*.png`, controller `temp/history-parity/samsung-zero.mjs`. Старый первый запуск без отсутствовавшего9338 forward оставлен `samsung728-zero-contact-no-forward.json`; его созданная, но неинициализированная own1248 закрыта после восстановления доступа. Successful own1249 закрыта finally, только собственный временный9341 forward удалён; power/Chrome restart/pairing/user tabs не менялись. Samsung передан следующему агенту.

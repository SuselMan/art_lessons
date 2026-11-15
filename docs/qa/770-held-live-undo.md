# #770 — Undo сохраняет незавершённые живые пиксели

06.11.2026, база `54441c3422153a02db670b50b2657a383ac9a298`.
Worktree `770-release-live-undo`, ветка `agents/770-release-live-undo`.

_rebuildLayer использует существующий _hasUnrecordedInk: слой с пикселями ещё не
записанного жеста остаётся unsettled до commit/cancel. Уже запущенная sliced replay
также не меняет буфер поверх такого жеста. Существующий _settleLayers освобождает
ожидание при приходе операции/отмене/уходе; другой слой пересобирается независимо.
Удаление слоя не удерживает фоновую replay job.

## Доказательства

Новый index.liveRebuildDeferral.test.ts: baseline **6 FAIL / 8**, после **8 / 8**.
Проверены собственный и чужой карандаш, commit, explicit cancel, disconnect с поздней
операцией, другой слой, структурное удаление и готовый replay job, встретивший новый
незаписанный штрих. После commit/cancel software pixels совпадают с полным replay.
MockGL здесь эмулирует геометрию/смешивание, но не бумажный шейдер и не настоящий GPU.

Browser baseline: FAIL (51.5 с). Другой участник держит штрих, владелец нажимает
Control+Z; старый canonical stroke исчезает из done log, а живой пиксель становится
почти белым (darkness 0.0353 вместо ink >0.08) ещё до UP.

В e2e/specs/heldUndo.spec.ts исходный Undo target рисуется настоящим CDP вводом.
Второй участник держит открытый жест через штатные _onStart/_onMove (метод device
penbench, не физический S Pen). Владелец нажимает настоящий Ctrl+Z, управляющая
операция проходит Socket.IO. Проверяются framebuffer пиксели у рисующего участника
и наблюдателя, done history до UP, итог после UP и сохранение операции в PostgreSQL.
Часы и таймеры браузера не подменяются.

Первый after: **2 PASS, 154.1 с**, Chromium/SwiftShader и Samsung SM-T970,
Chrome156, ANGLE/Adreno650/OpenGL ES3.2, DPR2.125. Darkness до/во время/после Undo:
Chromium local/peer 0.4301; Samsung local0.4967, peer0.4301. Это сохранность пикселя
внутри одного rasterizer, не утверждение побайтовой меж-GPU идентичности.

Отдельно перепроверяются HTTP400 автоматической выпечки: browser fetch probe
только читает код клона ошибочного ответа, не меняет запрос или ответ; допускается
только not_a_checkpoint_seq с последующим продолжением рисования/сохранения.

Компактные логи/source SHA256/паспорт и cleanup находятся в игнорируемом
`temp/770-release-live-undo`. После QA закрываются собственные targets, восстанавливаются
питание/Dozing, удаляются forward29270/reverse6261, runtime, БД/volumes и зависимости.

Итог: полный движок **1888 / 1888, 172 файла, 369.65 с**; усиленный structural-delete
тест проверяет отсутствие буфера/job/unsettled до отмены потока, **8 / 8 PASS**.
Повтор browser с наблюдением отказов: **2 PASS, 106.8 с**. На Samsung оба HTTP400
точно несут `not_a_checkpoint_seq`; клиент обновляет index, рисунок сохраняется.
Других отказов автоматических снимков в этом прогоне не было.
Typecheck, финальный typecheck:e2e, lint:fix, map:check/map:rules: exit 0.
Собственные Android targets отсутствуют (проверено), питание7/Dozing восстановлены,
forward29270/reverse6261 удалены.
Собственные runtime, три контейнера/volumes, trace/video и dependency views убраны.

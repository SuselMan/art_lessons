# Длительная стабильность на малом общем холсте

Источник combined b8633207, indexSHA c8c5be23229f1b2fee0357c65fe22c3e20bc7d66bd26fcd74d4bf4093d8d4536, frontend5314/backend4537. Обычный UI custom640×480, brush32, настоящие pointer-жесты, все эффекты включены. Собственная комната ltLjzwXe, домашний Chrome/Vega. Два автора пишут в один layer-1 с различными washId. Максимум два активных engine: B-page закрывается перед fresh witness, BrowserContext/identityB сохраняются; witness закрывается перед B-rejoin. История не очищается.

Завершены20раундов настоящей работы, сумма2403682мс =40,061минуты.160запланированных native жестов плюс5дополнительных peer-жестов с serverACK во время actual WebGL loss. Итог165stroke операций/186операций всего,7paper_dry. Каждый короткий жест проходит encoded≤36дабов/однаchunk проверку. Периодические Dry, UndoRedo, обычный перезаход и5контекстных потерь с восстановлением.

Все20 проверок полного authoritative журнала A/B/fresh прошли, включая все agedDry. В каждой завершённой фазе PNG непустые, GL0/contextLostfalse. Пять restore имеют faults[]. Ожиданиеidle>60с ни разу не возникло; controller имеет явный предел240с и прогресс rebuild/settle каждые5с после60с. Самый поздний restore-round18 на152жестах вместе со всеми фазами занял185010мс; это не чистое время restore.

Пиксельная эквивалентность не является полным PASS. Из40 A/B versus fresh сравнений37 точны, три отличаются:

| Раунд/автор | Различных пикселей | raw max | alpha max | premult RGB max |
|---|---|---|---|---|
| 2/B | 1 | 2 | 2 | 2,6039276 |
| 9/A | 1 | 1 (RGB0) | 1 | 0 |
| 18/B | 1 | 1 | 0 | 1 |

Порог не ослаблялся, native PNG снимается до B-rejoin. Все raw/premult данные и bbox сохранены. Причина единичных расхождений данным прогоном не доказана; прежний large-board residual этим не исправлен.

Минимальная свободная память завершённых фаз2770231296байта≈2,58GiB. RAMguard500MiB сохранён. Реальный RibbonScratchPool.bytes getter даётlive/free, а не отсутствие=0. Round0 live19,66MB/free39,37MB; round10 live19,66/free20,50; round19 live19,66/free57,80. Это байты в десятичныхMB. FieldCache1, reveals0 наidle. ИтогCP count1/packedBytes20313/carried0. Heap round0/10/19≈70,50/73,56/78,46MB; суммарный RSS собственных Chrome-процессов≈1558,8/1497,0/1524,4MiB. Эти выборки не доказательство отсутствия утечек; GC не форсировался, actual getWatercolorPerf.field/revealMB в работающий контроллер не был добавлен.

После20раундов сохранены cold.preJournal/prePNG и ready=true. Контроллер ждал координированный root restart только собственного backend4537 и файл cold-resume120с. Перезапуск/файл не произошли в пределах ожидания, поэтому процесс завершился exit1 с orchestrationtimeout. Chrome закрыт finally. Это не ошибка приложения и не отменяет сохранённые40,061минуты завершённой работы; холодный backend reconnect этим запуском НЕ проверен. Защищённый4536 не трогали. Финальные ready/state/error сохранены без переписывания.

Артефакты домашние: `680-combined-stability/temp/context-loss/small-long-stability-run/` — report.json,80roundPNG, cold-before.png. Копия report: `680-context-restore/temp/context-loss/small-long-stability-run/report.json`; контроллер small-long-stability.mjs. Sourcepassport index/OperationLog/hasActiveWater/servercoverage содержит точныеSHA. Первый bootstrapfixtureabort roomStore-before-ready сохранён отдельно small-long-stability, до рисования, source не менялся.

Scope: ограниченная непрерывная стабильность общего мокрого слоя на640×480/brush32,165настоящих жестов, история/потери/Undo/Dry. Это не performance большогоA3, не полная nativeparity, не leakproof и не coldrestartPASS.


Размер холста дополнительно подтверждён отдельным read-only Prisma audit: комнаты f_GlYesQ и ltLjzwXe имеют `infinite=false, canvasWidth=640, canvasHeight=480` в самой базе. Сохранённые PNG экспортированы640×480; roomStore metadata совпадает. Это физический размер холста, а не только viewport. Контроллер создания выбирает UI Custom и задаёт640/480. Артефакт `temp/context-loss/board-dimension-audit.json`; база и source не изменялись.

# Профиль акварели на Vega, 06.10.2026

Источник production `f5397918`, домашний стенд 5314 / backend 4537. SHA engine `c0fd96c0492b05408550ef8baf91a1b3e8389688a1b5375c38af763b16373408`, shader `d6928e5c49342a1ec16f47f4ee7fa9c4cbb9befd010e29fd7f833d975148bdd8`. Chromium с настоящим AMD Vega, видимая foreground-страница 1600×1000 / DPR1, Fine 1754×2480, debug выключен. Каждый случай — отдельная свежая комната и один жест через настоящие PointerInput handlers с синтетическим coalesced pen input (не физическое перо).

Захват `_strokeId` после pointerdown сопоставлен с `op.strokeId`, операция имеет server seq и не pending. GL0 / context healthy / solver завершён во всех шести случаях. Собственный Chrome закрыт finally. Два начальных bootstrap запуска и две ошибки неверного metadata guard исключены: система использовала Node18 и Zustand store API требовал getState; gesture хранится в op.strokeId, не op.gestureId или op.id. В измеренную выборку они не входят.

| Сценарий | Размер / траектория | Control active median / max | Control solver после penup | Morph + idle tail |
|---|---|---|---|---|
| Короткий | 80 / 1 leg × 700мс | 22.2 / 22.3мс | 3.206с | 11.922с |
| Плотный зигзаг | 80 / 8 legs × 150мс | 22.2 / 22.3мс | 15.156с | 23.975с |
| Крупная кисть | 240 / 4 legs × 250мс | 22.2 / 22.3мс | 11.523с | 20.243с |

Во всех control активных жестах >33мс=0; cadence примерно45Hz. CPU sampled arms (интервал1мс) также22.2/22.3мс; solver3.206 /15.318 /11.613с. Это отдельные реальные rAF sampling journals, не одинаковые операции для exact A/B. CPU profiler возмущает выполнение; отсутствие грубой разницы не делает sampled timing production oracle.

CPU profiles охватывают baseline, active, solver и morph целиком. Сумма sampled time short14.885с, dense27.462с, large23.609с; из неё `(idle)`14.303 /26.569 /22.598с. Это renderer sampling, не GPU-профиль: отсутствие JS работы не доказывает дешевизну GPU solver, compositor или driver wait. Sampled GC18–18.5мс за весь случай. Среди прикладного self CPU в large: `_updateWetTexture`96.5мс, `wetDryMsFor`38.5мс, его caller `_decayed`24.6мс, paperWetness raster `pass`28.6мс. В dense `_updateWetTexture`37.1мс; в short8.5мс. Эти величины являются накопленными за полный профиль, не ценой одного кадра. Caller `_updateWetTexture`→`_takePaperPartial`; `wetDryMsFor`→`_decayed`; `pass`→`raster`.

Предварительный вывод: одиночный жест текущей модели не воспроизвёл большие active hitches, но длительная очередь solver после плотного мазка воспроизведена. Общая45Hz cadence остаётся. Новая оптимизация не выбрана, источники физики/отображения не менялись. Для следующего причинного шага нужен burst из нескольких мазков или нагрузка историей, отдельно от этой short-control выборки. Предыдущие S / alpha / preserve / tiny-blit отрицательные эксперименты не повторялись.

Артефакты остаются на HOME: `680-combined-stability/temp/profile-current/results/{report.json,short.cpuprofile,dense.cpuprofile,large.cpuprofile,*.summary.json}`. На VPS только компактные summaries; из-за ограниченного диска raw profiles не копировались. Привязка CPU/trace clock к phase timestamps пока отсутствует: фазовый CPU бюджет и causal overlap с presentation по этим профилям не утверждается. WebGL asynchronous whole-pipeline timers и CDP presentation trace в этом новом наборе не запускались.

## Причинная разметка полной settle очереди

Дополнительный dense80 на неизменном f539, native ACK/GL0/debugOFF, завершён и Chrome finally закрыт. Runtime wrapping каждой closure очереди сохранил порядок и физические операции; elapsed CPU записывается без нового sync/readback. EXT_disjoint_timer_query whole-op surround каждого7-го entry, max160, результаты и disjoint читаются только после idle. Timing команды могут возмущать поток; это attribution, не улучшение FPS.

Фактически **985 entries / 15.1475с**, inter-entry median16.6мс. Суммарная CPU submission всех985 —75.5мс. Из них **74 flow upload +841 brush contact pulses =915 entries (92.9%)**; каждый contact pulse выполняет paired brushPass по pigment/color с копированием обратно. Остальные36 front chunks,6 puddle slices,5 diffuse/present и немного подготовительных/tide entries.

140 whole-op queries valid, disjoint=false. Contact pulse120 samples median0.30513мс /max6.68381мс; flow upload11 median0.01536мс /max0.02048мс; front5 median4.7974мс /max8.98864мс; один internal tide-front9.51552мс. Это GPU elapsed выбранных whole entries, не end-to-end queue/presentation latency. Query backlog wait вне региона и несэмплированные шаги не исключены. Сумму106.96мс sampled GPU нельзя называть полной стоимостью всех985 операций.

Конкретный slow stage установлен: сотни brush-contact pulses получают отдельный animation frame по политике settle scheduler. Очередь в среднем около65steps/s; множество коротких contact steps расходует почти весь15-секундный walltime. Это сильный scheduling кандидат, но отсутствие GPU/presentation проблем не доказано. Следующая guarded causal ablation должна батчить только короткие contact steps, сохраняя порядок, первый capture entry, lifecycle и canonical fixed-journal pixel result. Пока никакой source patch/default switch/publication не выполнялся.

Артефакт HOME `temp/profile-current/queue-results/report.json`, включая все closure signatures, ordinal timestamps, whole-op CPU/GPU samples. VPS raw не копировался. Имена групп определены по настоящему Function.toString тела closure; без inline source stack sampling на каждом кадре.

## Guarded contact batching ablation: fixed journal

Runtime-only grouping contiguous brushPass contact pulses по4, upload barriers и entry0 остаются на своих местах. Ни один pulse не удалён, порядок не изменён. Один recorded native op сериализован и отправлен двум fresh engines с одинаковой Fine1754×2480: обычный replay и batch4 replay. После завершения PNG RGBA декодированы HOME/PIL; **полный2480×1754 RGBA exact0/max0** между replay arms. Native capture vs обычный replay также exact0.107033 пикселя имеют цветной pigment mask; сравнение не пустое.

Normal replay solver16.4625с, batch4 **6.0115с (2.74× быстрее)**.839 pulses сведены к214 queued entries, остальные closure неизменны. GL0 / healthy / queue complete обеих сторон. Export после timing, raw PNGs HOME, Chrome closed finally. Один harness export-only invalid launch требовал await exportPNG Promise и excluded. Итог `temp/profile-current/batch-results/{op.json,report.json,comparison.json,capture.png,replay.png,batch4.png}`.

Это причинный результат для одного фиксированного журнала на Vega, не production patch и не доказательство безопасной отзывчивости на Samsung. Фиксированный batch4 нельзя слепо включать: самый дорогой sampled contact pulse6.68мс и слабый GPU могут дать дорогую группу; нужны адаптивное GPU-budget ограничение, сохранение cancel/lifecycle/input ownership и проверки нескольких участников/undo/reveal continuity. Native active timing при batch4 не измерялся, поэтому не заявляется рост active FPS. Результат поддерживает оптимизацию cadence contact stage, без уменьшения числа физических pulses или изменения сухой картинки.

## Bounded replay комнаты KJc0OoVo

Immutable47ops SHA JSON `d242bf844577fb0a6cc016e88da468e2738f64be5df6241d9d2aa9d06f6dd552`;41stroke,2undo(seq6/13),1layer_clear(seq11),3Dry(seq16/18/44). Fresh own Fine1754×2480, все операции appendOperation(remote), очереди/операторы неизменны. Это pipeline replay экспортированного журнала, не end-to-end HTTP/network production load. CPU wrapping/whole-op sparse queries аналогичны dense attribution; новые sync/readback во время stepping не добавлялись.

**180.098с cap → INCOMPLETE**, лог38/47ops, pending9, settle221/239, rebuildJobs1; healthy GL0. Контроллер завершился штатно и закрыл Chrome finally. Progress каждые5с сохраняет постоянное продвижение, не hard hang:10с log4;40с log14;95с log19;150с log28;180с log38. Snapshot отсутствует в исходных metadata. Итогового PNG не снимали, потому что журнал ещё не завершён; полной корректности replay этим прогоном не подтверждали.

За время cap66 queue jobs,65completed,21451scheduled entries и21433executed. Изexecuted16662contact pulses,2683flow uploads,1066front chunks,1022прочих. Contact+upload **90.3% executed entries**. Накопленная CPU submission: contact766.4мс,upload83.7мс,front52.4мс,прочие415.2мс (всего1.3187с), не GPU elapsed. Backlog cadence примерно120entries/с на длинных solver. Преобладание десятков тысяч short contact steps является конкретной причиной scheduling walltime.

**66 jobs ≠ доказательство повторного rebuild**: replay может запускать отдельную drawing coroutine job и её solver job. Наблюдался один rebuildJobs, и исходные undo/clear могут добавлять работу, но их отдельную долю не измеряли. Такой вывод без отделения jobs/layer/history делать нельзя. Предыдущая оперативная гипотеза jobs>41→повторныйrebuild отозвана.

Raw HOME `temp/profile-current/load-results/report.json`, небольшой aggregate `summary.json`. Производительность сети, snapshot generation, полное завершение41strokes и совпадение всех пикселей остаются отдельными проверками. Source/defaultpolicy/publication не менялись.

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

# #728: кандидат с GPU-бюджетом для contact pulses

Source candidate `7f70969d` поверх принятого main `8aa7e9f0`; собственный HOME hardware mirror 680-lifetime-hardware / 5311 использует существующие реальные зависимости, backend 4537 другого QA worktree. Защищённый 5314 не менялся. Root-source archive сначала был остановлен из-за медленной сети; законченная source-only синхронизация передала apps/web/src и packages/shared/src. Старые T/R/S prototype tests, которых нет в candidate HEAD, сохранены в temp/contact-budget/old-prototype-tests вне src. Рабочие копии/артефакты не удалены.

Принцип: уменьшаем число ожиданий кадра между теми же физическими шагами. Только явно tagged paired contact exchanges допускают batching; capture entry 0, uploads и прочие операторы не помечаются. Порядок/pulse count/format Dabs не меняются. WeakSet не удерживает освобождённые closures. Кандидат **opt-in, default OFF** через внутренний queue.contactBatchEnabled; публикации не было.

При penup/своевременном tick — максимум 4 contact pulses, 4 мс wall budget, gl.finish после каждого. Такой sync ограничивает командную очередь существующим механизмом, но его walltime не называется точным GPUelapsed. Перебор прекращается после первого дорогого шага, at upload barrier, смене job/lifecycle, pen-down или достижении бюджета. Backlog acceleration не умножает этот лимит. Active pen и late tick сохраняют прежнее расписание. complete/cancel/firstcapture semantics сохранены.

11 CPU tests PASS:5 новых meaningful budget cases +6 существующих ownership/lifecycle. Новые проверяют max4 при backlog 100, heavy first 12 мс → 1 pulse, upload barrier, active/late fallback, cancel inside pulse. Web typecheck/lint/map:check/map:rules PASS. Общий monorepo typecheck hardware mirror FAIL: нет @prisma/client для его неиспользуемого server workspace; это не объявляется полным typecheck PASS. Server 4537 работает из отдельной собственной копии.

## Vega same-journal gate

Immutable actual source hashes: index 37ddeb104d83b1c030f7f0b34a6db688659f9d6219740dfda118bf9b0df1db43; accepted shader 386994099ddf47f1004f84a6c8e1971d9f1652933d6c2ed30f5e7439ef164965. AMD Vega, viewport 1600×1000/DPR 1/Fine 1754×2480/debug OFF. Одна native dense 80 capture, затем два fresh replay одного JSON: OFF и opt-in ON.

Normal replay solver 16.5348с, budget ON **6.0683с**. Полный 2480×1754 RGBA EXACT 0/max 0; native capture vs OFF replay такжеEXACT 0. GL 0/healthy/queue complete обеих сторон. Raw HOME temp/contact-budget/results, PNG сняты после timing; Chrome closed finally. Это один фиксированный журнал, не cross-GPU/generalperformance proof.

## Vega native 80/400

Первый запуск остановился на create form timeout до жестов: недействительный bootstrap, Chrome закрыт в finally. Повтор на том же source завершился успешно. Dense 80: active rAF p50/max 22.2/22.4 мс, ни одного >33 мс; solver 5.9113 с, полный tail 14.6307 с. 377 queue ticks, максимум 4 шага; самый длинный postlift tick 5 мс с одним шагом. Короткий прямой 400: active p50/max 22.2/22.3 мс, ни одного >33 мс; solver 2.0053 с, полный tail 10.7214 с. 121 ticks, максимум 4 шага, максимальный postlift tick 1.2 мс. GL 0, server ACK, noop guard и завершение очереди подтверждены. Это короткий 400, не доказательство безопасности плотного тяжёлого 400. Raw HOME temp/contact-budget/native-results/report.json; собственный Chrome закрыт в finally.

## Samsung: пока не измерен

Cached SM-T970 подтверждён, собственный forward 9338 подготовлен. Первый запуск не нашёл собственный salted URL target; устройство было Dozing. Пользовательские вкладки не закрывались и не изменялись, измерений не было. После wake родительского агента read-only dumpsys показал Awake, keyguard showing=false/inputRestricted=false/secure=false. Это проверка доступности, не GPU PASS. Повтор отложен: GPU слот передан агенту обновления галереи.

## Первый Samsung native прогон

Adreno 650, Chrome 154, Fine 1754×2480, visible, camera angle 0, canvas 1670×2395/DPR 2.125. Candidate ON, реальный PointerInput с синтетическим coalesced pen; это не физический стилус. Native 5 strokes получили server ACK, очереди завершились, GL 0/lost false во всех timing captures. Отдельного OFF arm здесь нет.

Pigment400 и purewater400 — непрерывные пути по 6 секунд, по 360 active frames: active max 17 мс и 0 >33 мс для каждого; tail max 100/67 мс. Dense80 с колебанием нажима 6 секунд: 355 active frames, один 100 мс. Короткий следующий штрих, начатый при реально оставшемся settle, дал два active 167 мс. При этом _handleMove max 11.2 мс, q.tick max 1.8 мс: эти CPU timings не объясняют задержки кадров. Подозревается GPU burst синхронного _completeSettle в _onStart, но причинность ещё не доказана. Нужна отдельная bounded attribution.

Cold compile итог этого запуска **INVALID**: после link движок удаляет shader handles, финальный query COMPILE_STATUS этих handles вернул null; это ошибка диагностического gate, не доказательство compile fail. Такие queries выполнялись после timing captures. Recorder исправлен: статус сохраняется перед deleteShader. Новый cold PASS пока не объявляется.

Own target 1214 закрыт в finally. Raw HOME temp/contact-budget/samsung/extended-first.json и immutable extended-first-journal.json: 5 операций, snapshot null, journal SHA fcfcb085cde1b566b2845ff75307a5633150e52c22faa1e7893372216225f7cb. Источник5311 не менялся, пользовательские вкладки не трогались.

## Samsung pending attribution: sampled повтор

На том же frozen5311 повторены четыре пути с CPU sampler 2 мс и прозрачными wrappers существующих engine methods. Native payload независим от первого прогона, это attribution arm, не paired speed gate. Own1217 закрыт в finally. Исправленный cold recorder сохранил COMPILE_STATUS перед deleteShader: **104/104 true**, GL 0/lost false во всех timing captures. Все5 strokes ACK.

Новое касание после плотного зигзага действительно вошло в _onStart с **1192 остающимися шагами**. _completeSettle синхронно отправил их за50.4 мс, _onStart занял54.7 мс. Следом rAF интервалы дважды167.2 мс; _onMove в соседних callback занимал3–7 мс, q.tick максимум1.8 мс в первом control arm. Это конкретный GPU burst кандидат при обязательном синхронном drain перед новым stroke; GPU execution/presentation latency ещё не отделены direct GPU trace/query. Нельзя объявить устранение этого hitch одним postlift batching.

Sampler dense whole interval: idle8709 мс, readPixels72.7 мс через _packWashBoundaries; _updateWetTexture114.7 мс через _takePaperPartial/_display. Последний поток исследуется отдельно root. CPU profiler start bracket относительно page performance clock широк:261 мс. Поэтому CPU samples не привязаны к отдельному rAF167. Perf method wrappers и rAF находятся в одном page clock; rAF timestamp может предшествовать callback start, это не photon/input latency measurement.

Raw HOME temp/contact-budget/samsung/samsung-pending-attribution.json и четыре *.cpuprofile. Группировка не меняет operators, их порядок и tagged identities. Source/default flag OFF сохранены; публикации не было.


## Cap и front-chunk: продолжение ночного опыта

Диагностический `03c8f7c8` разрешает cap4/8/16 при том же 4 мс бюджете. Fixed Samsung journal, 5 packed strokes: cap4 14.5093 с, cap8 11.4381 с, cap16 9.7016 с. Полный RGBA всех вариантов точен, 0/max0. Но sustained native cap8/16 не устранили синхронное завершение при новом касании: remaining1176/1155, drain26.9/35.9 мс, active кадры184/167 мс. Cap16 не объявляется безопаснее8.

`6f0fba84` добавляет отдельно tagged существующие front relaxation и paired carry chunks, max4 с тем же finish/check-clock после каждого chunk. Между contact/front семействами, capture/upload и сменой job переход запрещён. Физические operators, порядок, данные и timestamps не меняются; снятие только обёрток возвращает предыдущий Plan byte-exact. Оба opt-in flags default OFF. CPU meaningful cases:31/31 PASS (budget11, ownership6, Plan14).

Samsung strict same5-op OFF-clean cap8/frontOFF 10.2134 с → cap8/frontON 9.1356 с. Полный RGBA1754×2480 byte-exact, 0/max0,1 387 910 непустых пикселей. Первый OFF был одновременно с чужим cold compile, поэтому помечен contended и исключён. Все own targets закрыты; raw HOME temp/contact-budget/samsung/samsung-prefix-*.

Native frontON: sustained pigment400/water400 по6 с active max17 мс; dense80 max84 мс. Следующее касание вошло с1172 оставшимися шагами: drain38.8 мс, onStart40.9 мс, затем два кадра167 мс. GL0,5 actual strokes ACK, own1235 closed. Это независимый native payload, не paired speed claim. Ускорение postlift не решило new-touch burst.

## Полный KJc0OoVo: sequential OFF/ON, настоящий rebuild

Immutable journal47 операций/41stroke, SHA d242bf844577fb0a6cc016e88da468e2738f64be5df6241d9d2aa9d06f6dd552, Fine1754×2480/#fdfdfc, snapshots отсутствуют. Vega headed Chrome1600×1000/DPR1, angle0, видимая страница, paper loaded/debugOFF. OFF context полностью idle + finalPNG + close ДО создания ON context; overlap нет.

OFF полный solver/restoration idle209.693 с → contactcap8/frontmax4 ON76.796 с (2.73×). В FINAL обеих arms: все47 authoritative seq1…47, pending0, settle null, rebuild0, reveals0, GL0/lostfalse. Весь RGBA2480×1754 exact0/max0,1 227 377 colored pixels. OWNED_CHROME_CLOSED. Raw HOME temp/contact-budget/load-results; PNG не переносились на VPS.

Queue ticks12046→4063, advances23594→23670. Advance count включает coroutine yields, а не только physical passes; не интерпретируется как изменение дозы. Max individual tick73.1/73.5 мс: дорогие untaged operators остались. completeCalls0. Наличие rebuild1 в промежуточном прогрессе не означало готовность: log47 появился около200/70 с, полный restoration idle лишь209.693/76.796 с. Это engine replay + реальные undo/rebuild из журнала, не сетевой end-to-end room load. Подсчёт job.start не записан в этом gate, потому новых утверждений о количестве jobs нет.


## Samsung pending GPU trace: CPU и GPU раздельно

Один bounded180с native primed frontON/cap8, без CPU sampler, own1236 CLOSED. Все5 strokes ACK/GL0. Trace4MiB buffer/gzip≤8MiB перенесён только на HOME после cleanup;39 477 events,6 user-timing marks. Mark args.startTime даёт прямое page-clock mapping; median offset197083981801.5µs, разброс всех шести offsets125µs. Это существенно точнее широкого bracket Profiler.start из предыдущего CPU опыта.

Новое касание:1134 remaining; complete26.9мс, onStart29.3мс. CrGpuMain CommandBuffer::Flush занял113.105мс (page34186.50→34299.61), затем99.505мс (34304.18→34403.68). Вложенные OnAsyncFlush описывают те же интервалы и не суммируются. Два active rAF183.9мс:34236.6→34420.5→34604.4. GPU command execution burst после синхронной submission совпадает с задержкой отображения; короткий CPUonStart не ограничивает очередь GPU. Это Chrome GPU-thread trace, не hardware timer-query длительность конкретного shader и не измерение photon latency.

Причина обязательного drain в index5491/Queue.complete: новый paint нельзя писать в общий wash/field до старого copy-back, иначе последний затрёт новые данные и нарушит replay order. Простое удаление complete или перенос его после paint не является исправлением. Front/contact budget сохраняет рисунок и ускоряет загрузку, но не устраняет этот barrier burst. Следующая задача должна сохранить ownership/shared-field semantics. Raw HOME temp/contact-budget/samsung/samsung-pending-front-trace-gpu-trace.json.gz (+summary.json), native JSON и sameclock wrappers.


## Невидимый progressive preview: scoped drain и active gate

`03f24b05` — diagnostic defaultOFF suppressDrainPreview. Queue отслеживает nested complete depth с try/finally; Plan.shouldPreview отсекает presentation ДО любых acquire/copies. Canonical solver/finish/landing не consult gate. CPU35 meaningful testsPASS, включая nested throw/default/async и реальное исполнение Plan passes без preview.

Samsung fixed journal5ops, четвёртый presentation-only reveal+fade=true и solver freeze next1/total1334/remaining1333, затем одинаковый complete и5-й op. OFF actual4tile preview callbacks inside drain; ON0,1117 rejected attempts (НЕ1117presents). Canonical inkLoad/inkColor/coverage три nonzero1024² SHA exact; wholeRGBA2480×1754 exact0/max0,1 387 910 nonwhite. OFF own1241/ON1242 CLOSED. ON совпал с чужими4cold links и помечен timingContended; fixture с readbacks изначально не performance arm. Первый1240 имел fade=false,callbacks0 и INVALID для suppression oracle; сохранён.

Отдельный actual native ON безfreeze/reveal override:5ACK/GL0, own1244 CLOSED.987 rejected attempts/0drainCallbacks/106asyncCallbacks — обычное живое preview не отключено. Новое касание1143remaining, complete26мс/onStart30.3мс, затем два rAF217.3мс. Trace CrGpuMain Flush87.958мс(page36242.21) и145.847мс(page36336.62); вложенные OnAsyncFlush не суммируем. Clock mapping5marks spread162µs.4MiB recordUntilFull trace содержит71 024events; final aftermark отсутствует, поэтому tail целиком не характеризуется, но start/end drain и оба longflush присутствуют. Это independent native payload, не paired speed regression claim. Suppression не устранилаGPUburst. Final morphidle в этом native arm отдельно не проверялся.

`81e32dac` — diagnostic defaultOFF suppressActivePreview. Engine.shouldPreview использует EXACT прежний downstream !this._strokeLayerId, поэтому отсекает только работу, callback которой уже вернул бы без рисования.37CPU testsPASS: actualenginectx active/nonactive/default/reentrancy. Ни second solver, ни deferred gesture не реализованы. Аппаратный Surface gate координируется root на его отдельном overlay mirror; own5311 на момент подготовки остаётся03f, protected5314 не трогался.

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

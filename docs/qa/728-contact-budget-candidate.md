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


## Следующие отдельные диагностические опыты

`fa084ed1` добавляет standalone shader helper, который пока не импортируется production программой. Он вычисляет неизменные flow texels один раз и возвращает нулевой обмен до дорогих pigment reads, только когда dose либо water contact равны нулю. Для конечных UNORM8 входов это точное нулевое значение прежней формулы; ненулевой wet diffusion при нулевой скорости сохраняется. Обратное текстовое преобразование восстанавливает исходный shader byte exact. Три CPU теста проверяют source drift, нулевые ветви и сохранение diffusion. Подготовлены 15 аппаратных fixtures: 128/256/512, wet ellipse, dry hole, zero dose, dry water, capacity. Обе программы вызывают настоящий brushPass; полный P/C RGBA сравнивается после timing. Отдельно нужны salt compile, GL/no-op guards и ограничения timing claim только самим оператором. Аппаратный результат ещё не получен.

`e2a7150a` допускает отдельный post-lift contact budget 4 либо 8 мс. Default остаётся 4 мс, front chunks всегда ограничены 4 мс; невалидный runtime budget также возвращается к 4. После каждой существующей единицы остаются gl.finish и чтение часов, lifecycle/late/active guards прежние. Три новых CPU проверки доводят общий набор Queue/ContactBudget/Plan/early-zero до 43 PASS. Контроллер подготовлен с записью wall duration каждой synced unit. Повышение бюджета может менять throughput и занятый кусок кадра, но не устраняет shared-field barrier. Перед любым включением нужны fixed payload canonical/render/morph exact и реальное новое касание; пока default OFF и аппаратный опыт не выполнен.


Samsung Adreno 650 standalone early-zero: own1251 CLOSED, две whole salted программы LINK PASS, GL0/lostfalse. Все 15 fixtures и оба P/C output полного RGBA exact0/max0; wet/capacity имеют реальное ненулевое изменение, zero-dose/dry-water сохраняют вход. Median512 baseline→candidate, P/C мс: wet ellipse5.7→4.9/7.4→5.5; dry hole5.4→3.9/5.8→4.1; zero dose5.2→2.8/4.2→3.0; dry water4.4→3.3/3.9→3.1. Малые128 measurements noisy и иногда candidate хуже. Это sync readPixels1×1 операторный bench, не fullsolver/native speed claim. Actual engine03f24b05, shader38699409 unchanged, helper fa084ed1. Raw HOME samsung/samsung-brush-zero-retry.json. Первый bootstrap1250 закрыт после восстановления только собственного cached ADB forward; измерений в нём нет.

Отдельно Queue e2a7150a на own5311, engine/Plan03f unchanged: same5ops cap8/front4 contactbudget4 против8, full idle, wholeRGBA1754×2480 exact0/max0, GL0. Последовательные own1252/1253 CLOSED, OFF закрыт до ON. Solver9.899→9.914 сек — ускорения нет. Raw HOME samsung/samsung-budget{4,8}-fixed.{json,png}. Попытка cap16/budget4 не нашла exact URL target и не исполнила fixture; nonce census пустой. Эта попытка не является performance result. Samsung явно освобождён и передан root; cap16/native budget пока не проверены, default4 не меняется.


## Диагональ ribbon: причинная гипотеза, ещё не объяснение facets

CPU diagnostic32ea3f00/ee722b46 использует реальные buildRibbonBands round/chisel. При постоянной ширине normalized across является одной аффинной плоскостью; при разной ширине четвёртый угол не лежит в плоскости первых трёх (residual >0.01). Ink/water/wet/strength/puddle/pigmentPool в пределах каждого сегмента остаются аффинными, residual <1e-6. В круглом width-changing контроле edge residual <1e-5, постоянный tipPressure также <1e-6. Это объясняет возможный seam волосков, но не доказывает происхождение заметного светлого клина. Diagnostic helper меняет только диагональ center-side quad, сохраняет все четыре corner attributes и winding; body fans/outline rings не меняются. Production painter его не импортирует.

Vega, fixed timeline journal2 water80→pigment15 на frozen5314 с scoped8aa dab/paper emitted shaders. Queue freeze не поймал async settle в remote пути; первый owned Chrome закрыт с phase timeout, измерений нет. Второй опыт перехватил настоящий Plan.prepare, выполнил только первый stitch и удержал дальнейшие физические ops/finish в обоих arms. Next1 gate, GL0, журнал двух arms exact, source nonzero. Swap исполнился309calls/1464quads (coverage366/ink-max1098). Source P sum1405301→1405298, V6785243→6785239, coverage14783980→14783974; SHA отличаются, сами по себе суммы не ограничивают локальные разницы. Actual display512×512 в обоих arms показал только бумагу: held plan ещё не landed. Поэтому display exact0 НЕ является валидным facet oracle. Нельзя утверждать, что гипотеза исключена. Raw HOME temp/contact-budget/triangle; owned Chrome CLOSED, Vega передана root/live. Следующая CPU-подготовка сохраняет прямые P/C/V/coverage plane maps для этого pre-solver seam; аппаратно ещё не выполнена.


Коррекция имени исторического native fixture: в моём samsung-budget-controller case `water400` до этой записи был `normal:0:100:PB29:round`. Настоящий parser задаёт water=parts[1], pigment=parts[2], поэтому это dry-pigment400, а НЕ pure-water400. Все опубликованные здесь rAF наблюдения этого case надо читать с такой фактической смесью; сырые payloads сохраняются. Pigment400 `100:100` и dense80 `100:100` корректны. Новый контроллер задаёт true clear-water400 `100:0` и проверяет preset passport. Независимые root Apple/Surface fixtures этим не переименовываются: их нужно сверять по собственным payloads. Triangle exact fixture `100:0→100:15` корректен.


Следующий Vega direct-material AB: обе arms next1/GL0, same2ops,1464 actual swapped quads, Chrome CLOSED. Прямые alpha-plane1024² PNG: P/C отличаются5pixels/max1; V6pixels/max1; coverage8pixels/max1. Nonzero domains около59k pixels, общийbbox58,150…379,395. На V.a до solver уже виден крупный наклонный светлый участок; P/C без такой резкой грани, coverage сплошная. Выбранная ribbon diagonal не управляет этим V участком. Raw HOME triangle/{baseline,swapped}-0-{inkLoad,inkColor,solventLoad,coverage}.png.

Однако CPU decode того же immutable journal обнаружил значительную разницу самих native траекторий: water107dabs, pigment96dabs. Максимальная point-to-polyline дистанция water→pigment86.16px около первого поворота340.79,178.88, обратная16.42px. Поэтому область одного water dose вместо двух из-за разного overlap может объяснять эту конкретную V грань. Одинаковые controlpoints двух independently generated gestures НЕ означали одинаковый baked path. AB одного и того же журнала против swap остаётся причинным для diagonal, но нельзя использовать этот fixture как подтверждение пользовательского crystal artifact. Следующий материалный stage должен изолировать solventBase/strokeSolvent либо взять настоящий room spiral journal, сохраняя actual geometry/wet.


## Настоящие петли из KJ journal и отдельная octile гипотеза

Поправка классификации: net turning −3.73 для seq14 не делал его спиралью. CPU atlas точных packed centerlines показал плотный зигзаг14; петли находятся в20/22/25/27/29/34. Атлас HOME temp/contact-budget/actual-spiral-paths.png. Будущие выводы должны опираться на actual geometry, а не одну сумму углов.

Faithful diagnostic fixtures оставляют ВЕСЬ original journal prefix, без удаления/пересэмплирования: seq1..27 (27ops, Node JSON SHA91428ed202e9994569c157ce0a262e9488c0dd320f51c143f73b0bcc2b6a0e81), seq1..34 (34ops, SHA3b630baede25fb251ce437ba1acc9aebf8998221e83d00d51c4449c91370f314). Оба сохраняют undo6/13, clear11, dry16/18 и все water predecessors. Target27 full100:100/wet82 внутри water26, wash2xbTjBRSxT; target34 full100:100/wet98 внутри water33, washT6JLvUEGsV, prior31/32 тоже остаются. Original Fine1754×2480, безsnapshot. Они пока не измерены аппаратно. Ориентировочные world ROI27[1235,1705,1311,1768], ROI34[902,1427,985,1503] включают nib support; для реального front gate нужно добавлять действительный budget margin, а не отсекать front этим bbox.

Water-front source использует восемь направлений с длинами1/√2. На плоском постоянном film/cost, при достаточной relaxation и до8-bit quantization, получается octile metric: max(|dx|,|dy|)+(√2−1)min(|dx|,|dy|). Iso-cost контур имеет восемь граней; в22.5° radius на7.61% меньше евклидова. CPU oracle temp/profile/octile-reference.{py,json} явно перечисляет допущения. Это конкретная отдельная гипотеза crystal facets, НЕ объяснение pre-solver V wedge. Требуются настоящие target27/34 P/V/coverage/front-cost maps до/после; никаких source/model изменений на основе одной этой формулы не сделано.

### ROI ping-pong: первый hardware oracle (7 октября, 22:20 UTC)

Диагностический source `1b2368a4` на собственном HOME5311 основан на
`8aa7e9f0`, с точным production early-zero `bd9dc5f4`. Это не текущий
chronology-кандидат root. Флаг `contactRoiPingPong` по умолчанию выключен.
Frozen source passport: `temp/profile/roi-source-passport.json`.

Samsung Adreno650: отдельные последовательные страницы1269 OFF/1270 ON,
обе закрыты до следующего arm. Один неизменный five-operation journal
`fcfcb085cde1b566b2845ff75307a5633150e52c22faa1e7893372216225f7cb`,
настоящая незавершённая работа `next=1,total=1334`, A4Fine1754×2480.
Полные ненулевые P/C/V/coverage1024² совпали по SHA256; whole RGBA1754×2480
совпала байт в байт (0 изменённых пикселей/max0,4,006,163 colored), GL0,
context alive. В обоих arms four synchronous preview callbacks.
Это не счётчик видимых кадров и не доказательство всего живого morph.

15.796/15.805с включают fixture/readback и не показывают ускорения. Следующий
гейт — actual destination/copy census, затем native rAF/newtouch. Raw PNG
только HOME `temp/contact-budget/samsung/roi-fixed-{off,on}.png`; маленькие
отчёты VPS `temp/profile/roi-fixed-{off,on}.json`. Default не включён.

ROI census на Samsung (1271/1272 CLOSED) доказал, что opt-in реально исполнил
новый путь: brush draws3840 в обоих arms, destination switches каждого
P/C0→1904, copyTexSubImage2D3984→176. Полные P/C/V/coverage снова exact.
Однако fixture15.733→15.817с: ускорение общего solver не доказано.

Native dense80 независимые gestures (1273/1274 CLOSED): active max33/34мс,
tail1003/936мс. На новом touch active max385/485мс; остаётся hitch. Из-за
1500мс встроенного harness-tail новый touch получил лишь51/62 pending
steps. Основной complete1361/1367 возник ещё внутри первого жеста, вне
поздно включённой trace. Поэтому этот эксперимент не измеряет immediate
newtouch1134-step barrier. Raw traces HOME `roi-native-{off,on}-gpu-trace.json.gz`.
Final morph idle/GL0 проверены; async callbacks8 в обоих arms — не visible
frame count. Opt-in сохраняется OFF. Подготовлен отдельный immediate
controller: два жеста внутри одного Runtime.evaluate, первый без harness-tail,
trace включена до первого input; модель/пакет dabs не изменяются.

Immediate native refinement (1275/1276 CLOSED, diagnostic8aa): второй
pointerdown вызван внутри того же Runtime.evaluate через0.9/0.8мс после
captured pending92/99. Новый active max1003/1020мс, tail1103/1070мс.
Первая _completeSettle1362/1366steps43.2/39.1мс была уже внутри первого
gesture end; последующая на новом touch92/99steps5.8/5.4мс.
ROI physical copies2771→203, итоговый morph idle/GL0 в обоих arms.
Эти independent native journals не парный same-payload speed oracle.
ROI не устранил hitch, default OFF; parent не планирует интегрировать его.

Trace8MiB переполнилась до lift: из140096events около128k были toplevel
RunTask/mojo/epoll/watchers. Отсутствующие end markers запрещают заявлять
GPU attribution по этой trace. Отдельный bounded refinement оставляет
только gpu+blink.user_timing,4MiB, и один caller stack на complete>1000steps.

### Точная фаза большого drain: Samsung1277 CLOSED

Полная trace только `gpu,blink.user_timing`,4MiB:29942events,10marks,
before/after присутствуют. Median trace→page offset202514116485.5µs,
spread158µs. Один caller stack доказал
`PointerInput._handleUp → _onEnd → _finishRibbonStroke → _completeSettle`.
В own diagnostic source это finish на index.ts:5920 и явный drain предыдущего
job внутри `scratch.diffusePending` на7610 перед подготовкой нового settle.

Page clock:

- `_onEnd`12975.4–13036.6мс; внутри него complete1366steps12988.9–13030.9мс.
- CrGpuMain `CommandBuffer::Flush`13010.831–13864.122мс (853.291мс).
- Новый gesture t0=13068.3; его `_onStart`13068.6–13076.3мс,
  complete87steps13068.8–13073.9мс (5.1мс).
- Следующие неперекрывающиеся GPU Flush13872.902–14059.485мс (186.583мс),
  затем14059.575–14107.310мс (47.735мс). Nested OnAsyncFlush не суммировались.
- Первый active gap нового gesture1003мс; конечный morph idle/GL0.

Большой GPU burst начинается ещё внутри предыдущего `_onEnd`, после его CPU
возврата остаётся исполняться через следующий pointerdown. Это локализация
очереди команд, не доказательство стоимости отдельного shader и не photon
latency. ROI copies не решают эту физическую работу. Паспорт всё ещё изолированная
модель8aa, не текущая chronology main. Raw HOME
`roi-phase-off-gpu-trace.json.gz`, компактный VPS `temp/profile/roi-phase-summary.json`.

### Current577, straight native400, Samsung1279 CLOSED

Own5316 HOME `680-water-wet-tone-qa` source SHA совпал с root passport:
indexba05a856, scratchf386ee21, painter5fcde271, Planee86b25e,
Queue43e450dd, shader8a4df66c. Единственный opt-in sourceFilm=true;
coverageFilm=false, zeroPigmentContacts=false. Queue tuning отсутствует.
Первый bootstrap1278 отклонён устаревшим diagnostic cap guard доinput;
он закрыт и не считается измерением. Guard исправлен только в controller.

Непрерывные6с gestures A4Fine1754×2480, Adreno650, camera0: loaded400
100:100 active max27мс; настоящая water400100:0 max17мс. Поодному
нативному ACK operation (54/51 baked dabs). Ни один не пересёк chunk boundary.
Harness-tail отключён; tailMax0 не означает плавное досыхание.
_onEnd92.0/55.4мс; _finishRibbonStroke57.1/25.1мс. Большого prior complete
в этих двух случаях нет. Ожидание solver послеlift10.9/11.2с, затем final
morph ещё6.68с доtrueidle. GL0/contextalive/final2ops, wholePNG HOME.

Обе traces полные (по8marks,4MiB gpu+user_timing): clock spread107/113µs.
Максимальный loaded GPUFlush31.629мс начинается после_end; pure13.802мс.
Старый853мсburst здесь не проявился. Это straight400, не dense/chunk control,
и не paired old/new performance proof. Raw HOME
`current577400-phase-retry-{loaded400,truewater400}-gpu-trace.json.gz`,
compact VPS `temp/profile/current577400-phase-summary.json`.

### Target27 front metric: причинная gross ablation

Own5311/1b diagnostic, frozen8aa paper+DAB, неизменный prefix1..27 SHA
91428ed2. Первый1282 отклонён пустымmaterialguard: отдельный imported Plan
constructor не совпал с actual instance из-заViteHMR module identity. Retry
оборачивает actual instance; sameModule=false подтверждено. Первый файл
отчёта повторно использован retry; summary1282 явно восстановлен изstdout,
не выдаётся за исходныйimmutable report.

Samsung1283baseline/1284cardinal последовательноCLOSED. Только126 front
calls target27 временно используют отдельный program8→4neighbors; все
predecessors и другие physical passes исходные. Full prefront P/C/V/coverage
SHA256 EXACT, source/seed/order/geometry неизменны. НенулевыеROI guards, GL0.
Actual target27 `u_dryContact` uniform writes=0 во всехcomposites, такчто
coverage.r bristle consumer неактивен здесь; poolstreak также0.

Доcarry cost.r изменился10129px/max141, P/C/V/coverage0diff. Послеsolver
P15157px/max20, C16761/max21, V/coverage0diff; wholeRGBA18989px/max60.
Переход к4neighbor создаёт более заметные ступеньки/ромбы вouterhalo.
Frontmetric причинно участвует в конечном пигменте, но в baseline27 нет
явной решётки, совпадающей с жалобой пользователя. Это не доказательство
причины исходныхtriangles и не предложенныйfix. Светлая innerобводка
остаётся в обоих arms. Raw/atlas толькоHOME
`temp/contact-budget/triangle/front27-{baseline,cardinal}-planes.json`,
`front27-atlas.jpg`, `front27-comparison.json`, wholePNG рядом.

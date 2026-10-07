# #728: доказанно нулевой пигмент — водяной Plan

Кандидат от `8162113b`, отдельная ветка `agents/728-pure-water-plan`.
`diagnosticPureWaterPlan` по умолчанию OFF. Не меняет Engine, shared, shader,
тон воды, сухую кисть или кончик. Это ещё не аппаратный результат и не исправление
плавности, доказанное на устройстве.

## Разрешение и алиасы

Нельзя выбирать этот путь по `preset.pigment=0`: вода может поднять старую краску.
Разрешение — уже существующий полный `skipZeroPigmentContacts` proof из Engine
плюс `scratch.pigmentInputsKnownZero`, захваченные один раз в `prepare`.
Engine проверяет полный ordered log, неизвестный snapshot prefix, live pigment,
rebuild/history repair и непереданный peer ink. Восстановленный scratch отмечает
provenance unknown. Этот кандидат не ослабляет ни один из этих guards.

Пигментный `settle` не строится. Остаются исходные stitch/capture P/C/V/coverage,
нулевой mobile split, прежний front seed и все waterFront draw commands.
`frontOps(c,a)` использует `a` как COST ping-pong даже при нулевом P. После него
`a`, `c`, `cc` очищаются; canonical zero wet output — `c`/`cc`, а не COST alias.
Group tide сохраняет coverage-derived seed/front/band/gather в прежнем порядке;
только пигментные mode7/14 и восстановление цвета заменены clear zero dry outputs.
Его geometry не пишет V/coverage, но сохранена для строгого water-command oracle.

Не строятся carry15/16, remobilization18, diffuse/puddle/fibre slices, pigment
contact pulses, pool streaks и pigment tide transport. Прежние half-resolution
snapshots и copyback пока сохраняются: это ограниченный первый кандидат, а не
переписывание storage. Presentation получает ненулевую водяную coverage и нулевые
P/C; phase/PaperWet/source данные не изменяются. `finish` и running source-command
rebase остаются прежними: будущая краска нового film не очищается вместо replay.
Новых буферов, программ, caches или формата snapshots нет.

Вне разрешённого zero branch строится исходный `settle` и исходная tide. Вызовы
`groupTideOps` вне `prepare` не получают zero capability: отдельный UI Dry по
этому патчу не оптимизирован. Сам Dry/Undo/replay контракт не меняется.

## CPU

- 79 тестов PASS: Plan75 + существующий full-layer provenance4, maxWorkers1,
  15.44s. Обе groupDry/opDry ветки и single/mixed colour metadata.
- В pure branch сохранены waterFront geometry/scalars/order и compositeDomain;
  нет carry/diffuse/contact/remob/pigmentColor.
- Missing full-log proof или unknown scratch: прежний command trace.
- COST alias очищен после фронта; late group-tide geometry не пишет wet P/C.
- После pure plan следующая краска снова выполняет ordinary diffusion.
- Permission фиксируется при prepare; loss forget→dispose/finish не возвращает
  dead-context owned inputs в pool, idempotent disposal.
- Actual app TypeScript, oxlint, diff-check и architecture map PASS.
  Existing real deps из `680-device-qa-guards/node_modules`, новых установок нет.

Логи: `temp/pure-water-plan/final-tests.log`, `types.log`, `lint.log`, `map.log`.
MockGL здесь доказывает порядок/ownership, не численные GLSL значения.

## Обязательный следующий аппаратный gate до интеграции

Root review, затем один собственный Samsung/Vega context. Fixed journal, physical
board/paper/source passport и flags одинаковы; OFF/ON включается только в own Plan.
Сохранить precondition strong proof и каждый фактический prepare decision.

1. Pure water straight400 и dense multi-chunk400 на доказанно пустом/очищенном
   слое: одинаковые immutable inputs, canonical P/C строго zero, V/coverage/front
   поля и результат source/landing byteexact. В существующем 27-field capture
   явно разделить canonical/source fields и COST temporaries: последние могут
   иметь другое last-use содержимое, их нельзя выдавать за пигмент или скрывать.
2. Обычная краска и вода поверх неё — отрицательные контроли, gate false;
   whole canonical P/C/V/coverage и ordered commands exact OFF/ON.
3. Pure→pigment в том же wash: invalidation strong proof, следующие pigment
   inputs/outputs exact, nonempty alpha mandatory, native/packed replay и
   ordered Dry/Undo/Redo endpoint wholeRGBA exact. Unknown snapshot/carried state
   должен выбирать ordinary path.
4. Actual lost/pending owner cleanup, retained confirmed journal. Измерить
   active/newtouch/tail rAF и GPU wall отдельно; CPU submission не означает FPS.

Никаких GPU запусков или изменений пользовательского стенда для этого кандидата
пока не было. Публикация и default ON не разрешены этим QA.

## Samsung: фиксированные журналы OFF/ON

Аппаратный прогон `run-zeroproof321d_1791358070578` завершился exit 0,
все собственные вкладки 1422–1424 закрыты. Runtime: f52a2b94, 986 файлов
web/shared сверены по SHA; пользовательский 5329 не менялся.

Чистая вода: 119 канонических/source сравнений и wholeRGBA точны.
Из 139 сравнений четыре диагностических временных COST-поля b/pressure
отличаются на двух операциях; это не утверждение о равенстве всех 139 полей.
WaterFront сохранён: 252/252; carryP 28→0, diffuse 26→0, поздние fibres 8→0.
P/C нулевые, V и coverage положительны. Цветной отрицательный контроль:
все 139 сравнений точны, прежние 2596 contact, 28 carry и 26 diffuse сохранены.
Вода→пигмент: 185 канонических/source сравнений точны; временные COST-поля
первых водяных операций отличаются так же. WholeRGBA точен, GL0, lost=false.

Это standalone replay фиксированных журналов. Цветные контрольные журналы
получены явной сменой preset/цвета записанных водяных операций, а не записью
нового native ввода. Half-res/copyback и dryCol охвачены полными полями;
одновременное source-film рисование нового native жеста этим тестом не доказано.
Длительность включает readback и SHA и не служит измерением плавности.

Первый `run-zeroproof321d_1791358002349` завершился до создания вкладки:
ошибка разбора MemAvailable в тестовом runner. Raw сохранён; это отказ fixture,
не физики. Исправленный parser проверен на реальном /proc/meminfo.
Raw и точные runner/input/source manifest находятся в
`temp/pure-water-plan/hardware/`; они не входят в коммит.

## Обычный Room: native Samsung OFF/ON

`temp/pure-water-plan/native/run-pureplanNative_1791358714375`:
exit0, errors[], закрыты собственные 1427/1428, Adreno650/GL0/lost=false.
Полный f52 source986 SHA совпадает. Обычный tracked Vite config в
HOME `680-lifetime-hardware/temp/f52-room-native`, HTTPS5331, backend4539
не менялся. Два прежних bootstrap FAIL сохранены отдельно: custom standalone
config не разрешал React, затем virtual:pwa-register; до engine/рисования.

Физический холст1754×2480, round watercolor water100/pigment0/size400,
3s input с двумя coalesced samples/rAF и следующим коротким touch.
Исходные flags: async/split/lazy/phase/fibres/band/batches/source-copy OFF,
sourceFilmRebase/zeroContacts ON. Только diagnosticPureWaterPlan OFF/ON.
Два реальных stroke ACK до Dry, strongzero prepare2/2 в обеих arms.

| Показатель | OFF | ON |
| --- | ---: | ---: |
| Active max rAF, ms |17|17|
| Tail max rAF, ms |919|602|
| Next touch handler, ms |66.2|58.9|
| Next touch after lift, ms |83.6|83.6|

Это одна последовательная native пара одинаковой геометрии/длительности:
rAF-адаптивные журналы различаются, не fixed-tape причинный field oracle.
Readback/export выполнены только после измеряемого tail/orderedDry.
Задержка602ms остаётся; smooth PASS отсутствует.

После водяного Redo следующий native пигмент100 на том же слое видим:
112723/112492 nonempty pixels. Последний короткий пигментный touch Undo
удаляет17549px/max255 в каждой arm; Redo возвращает nativeDry wholeRGBA0.
Все10 серверных операций каждой arm имеют ACK, pending=false. Чисто-водные
Dry PNG ожидаемо прозрачны: их equality0 сама по себе не доказательство V.
Здесь нет независимого fresh-reader/контекст-loss native endpoint.
Полный fixed-tape V/coverage и следующий P/C доказаны предыдущим gate.
Raw `rgba-audit.json`, исходный native helper и runner сохранены рядом.

## Следующая причинная диагностика tail602ms — только CPU-подготовка

Подготовлены ignored `temp/pure-water-plan/causal-trace/observer.js` и
`controller.mjs`, Node syntax и `observer.test.mjs` PASS. GPU не запускался.
При следующем разрешённом trace требуется исходный current source passport
(включая c740 suppression), обычный ready/idle Room и existing RAM guard.
Контроллер требует явные ROOT_GPU_GRANTED, OWN_TARGET_ID, OWN_NONCE и APP_URL,
не создаёт/не навигирует пользовательские вкладки. Прямой запуск пока не заменяет
существующие outer source/RAM проверки аппаратного controller.

Observer хранит identity фактически исполняемых job.ops, job/scratch, cursor,
порядок primitive pass/copy/draw вызовов. Наблюдает queue.start/advance/complete,
Plan.prepare, waterFrontStep/fieldOp.mode/resample и остальные passes, pool buffer
copy/clear и drawRibbonBands. Синхронный complete очищает queue.current прежде
чем выполнит остаток: observer удерживает именно прежний job и читает его cursor,
а не приписывает всё «outside queue». Во время последнего advance completion
отдельно распознаётся по снятому текущему job. Исторические op labels определяются
по identity, а не по приблизительному номеру shader или порядку массива отчёта.

Никакие ops/finish/generator не заменяются. Painter.paint возвращает прежний
итератор без next()/return(). Аргументы/receiver/exception identity/командный порядок
и возврат исходных методов проверены CPU counterexample. Обёртки добавляют только
наблюдения и userTiming markers; источник данных и shader uniforms не меняются.
Buffer copy и вложенный fieldOp могут относиться к одному submission: длительности
вложенных CPU spans нельзя суммировать как GPU стоимость.

Trace должен разделить waterFront252, копии/landing/source-command rebase и
presentation. Это обозначения CPU submission, не GPU completion. External GPU
trace нужен для связи userTiming с реальным graphic pipeline gap; readPixels,
GPU fences и новую бюджетную синхронизацию не добавляем. No-front ablation отвергнута:
front сохраняет V/геометрию и не является доказанно нулевым оператором. Следующий
валидный кандидат может устранять лишь реально неиспользуемый preview/copy, не воду.

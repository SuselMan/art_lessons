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

## Samsung fixed-tape gate

Source f52a2b94/986trackedfiles, три неизменных журнала OFF/ON, actualAdreno650.
Raw: `728-pure-water-plan/temp/pure-water-plan/hardware/
run-zeroproof321d_1791358070578/report.json`. Root независимо прочитал итог:
closedtrue/errors[], все три casescomplete; GL0/lostfalse обоих плеч.

Pure:139comparisons,119canonical/source/whole exact; четыре отличия служебных
field.b/pressure послеop1/op2. Paintednegative:139comparisons,119canonical
exact и все служебные также exact. Pure→pigment:215comparisons,185canonical
exact; те же четыре служебных отличия только до появления пигмента.
Это не139/215 полностью одинаковых временных буферов. COST ping-pong отличия
отдельно сохранены. Root compact review:temp/night-728/pure-water-full-review.json.

Кандидат интегрирован как898cac3c с defaultOFF. Диагностические readbacks/SHA
доминируют длительность: скорость и native tail этим gate не измерены.
Дальше native400 с actual next touch/Dry/Undo/Redo; пользовательский5329
по-прежнему d88.

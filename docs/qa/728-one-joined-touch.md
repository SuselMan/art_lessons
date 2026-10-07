# #728: один новый жест над незавершённой той же лужей

Диагностический флаг `_wcJoinedTouch` выключен. Room остаётся синхронным;
material preview и async FIFO не включаются. Пользовательские стенды не менялись.

Причина эксперимента: actual Vega first-pixel probe показал hot penDOWN
376.3 мс против cold 15.9 мс. CPU предыдущего drain занял 3.5 мс, но отправил
348 GPU draws; readback-верхняя оценка GPU ожидания — 366.9 мс. Эти цифры
принадлежат независимому профилю root/profiler, не новому кандидату.

Принцип: сохранить предыдущий физический job и допустить ровно один новый film
в тот же scratch. Имеющийся sourceFilmRebase записывает собственные копии
аргументов deposit/coverage/source-команд и после landing старого job
переигрывает их на обновлённой базе. Это настоящий ribbon deposition, не
полноэкранный заменитель материала.

Admission требует watercolor, sourceFilmRebase, прежний scratch/wash/layer,
точный прежний preset и RGB, обычное условие wet/recent join, выключенные
async/material/split. Wash signature сама по себе недостаточна: она равна `wc`
и намеренно разрешает смешивать разные цвета. Lease привязана к конкретному
job; повторная admission сначала завершает его. Новый gesture может создавать
только один следующий film, не цепочку будущих texture references.

Во время overlap wash-boundary checkpoint и обычный checkpoint не создаются;
export/review-export отказывают при ещё активном новом жесте. Network snapshot
сохраняет прежние quiet gates (active stroke/settle). Cancel/loss/destroy
сбрасывают lease; existing scratch loss забывает команды без GL replay/recycle.

Ограничение: penUP нового жеста всё ещё завершает предыдущий job до prepare
следующего. Барьер переносится с DOWN на UP. Это не закрывает общую плавность,
не доказывает качество live morph и не разрешает включение в продукт.

CPU: 96 тестов в watercolor + joinedTouch + coverageFilm прошли; дополнительный
контроль typed bands прошёл 5/5, whole-web TS завершился exit0.
11 focused тестов joinedTouch + coverageFilm проверяют реальную native admission,
сам факт записанных source draws, неизменяемые nib/scalar/array и полные Float32 bands аргументы,
цвет/split fallback, защиту третьего film, отказ bake/export/checkpoint и loss
без replay. MockGL не доказывает физические P/C/V/coverage.

Перед включением обязателен actual GPU paired control с одинаковыми pointer
samples и timestamps: OFF полный drain / ON overlap, полные поля P/C/V/coverage
и native/Dry/replay/UndoRedo endpoints; отдельно penDOWN GPU-ready и penUP gap.
Source/flags/preset/цвет и accepted journal должны совпадать. Нельзя выдавать
разные adaptive input tapes за paired cause proof.

## Дополнительный lifecycle review

`bakePreview` и независимый `bakeLayerByFullReplay` также отказывают при joined lease и активной кисти. Natural
completion сбрасывает старую lease через существующий scheduleFieldRelease
callback; отмена и destroy идут через cancel. Job metadata хранится в WeakMap:
только маленькая копия preset/RGB/gesture, без дополнительных GL handles. Она
создаётся при start только с включённым диагностическим флагом. Включение флага
после создания незаписанного predecessor консервативно оставляет старый drain.

Новый тест изменения RGB на месте показал, что `finishContext.color` может
ссылаться на mutable opts. Поэтому это поле больше не используется как proof
для admission: guard читает immutable job metadata. Старый физический путь
не изменён; произвольная мутация private opts не является новым публичным API.

При prepare старый job синхронно выполняет captureInputs как op0; это граница
P/C/V/coverage и S2 snapshots до следующего source draw. Scalar/contact/tide
данные читаются во время prepare. Поздний present читает mutable tile records
только в отдельные временные буферы; при активной кисти его callback не публикует
картинку. Поздний physical land намеренно выбирает текущий film base; finish
восстанавливает coverage base, lands старые fields, очищает новый film,
переигрывает owned source commands, освобождает captured inputs и только старый
film. Это требует actual whole-field oracle, особенно wet metadata/front:
совпадающая pointer tape сама по себе не доказывает одинаковый recorded wet.

Lifecycle CPU retry: natural replay ровно один раз, destroy/loss не выполняют
commands, новое поколение metadata не наследует старую lease, in-place RGB и
изменение preset запрещают admission. Один ошибочный тестовый while(null===null)
остановлен как fixture loop; исправлен обязательной проверкой job non-null и
границей 10 000 шагов. Не ошибка физики, raw сохранён.

Финальный lifecycle контроль: 15/15 тестов PASS, whole-web TS exit0.

### Следующая CPU-ступень: вода → пигмент / другой RGB

Отдельный `_wcJoinedTouchMixed=false` допускает изменение watercolor preset/RGB
только при наличии захваченного `RibbonCanonicalFinish` предыдущего job.
Захват происходит до будущего `beginStroke`: finish/color, paints, gesture,
foreign/contact inputs, composite/spacing/direction принадлежат старому job.
Plan получает собственную копию объединённого dryCtx после fold bounds.
Новый source deposition использует новый профиль и сохраняется существующим
immutable source recorder; старый land затем выполняет прежний ordered rebase.
Дополнительных GPU-команд сам захват не создаёт. Legacy OFF путь не захватывает
этот контекст и сохраняет прежнее ограничение одинакового preset/RGB.

Сохраняются одна lease/один будущий film, точное совпадение scratch/layer/wash,
sourceFilmRebase ON, async/material/split OFF, прежние loss/export/checkpoint
границы. UP всё ещё является барьером. Другая layer/new wash не допускается.
CPU-тест использует настоящие source calls для чистой воды → красный пигмент и
старого пигмента → другой RGB; проверяет неизменность старых metadata и наличие
новых source commands. Это не доказательство GPU P/C/V parity или ускорения:
следующий обязательный gate — одинаковая material tape/wet metadata, полный
native/replay P/C/V/coverage и Dry/UndoRedo на железе.

CPU результаты mixed-кандидата: 101 тест / 3 файла PASS (joinedTouch,
coverageFilm, watercolor), затем усиленные mixed recorder/export/loss 16 / 2
PASS и финальный gesture identity guard 10 / 1 PASS. Whole-web TypeScript exit0.
Логи: `temp/pure-water-plan/causal-trace/joined-mixed-{final-tests,recorder-tests,final-guard-tests,types}.log`.
Ни одна пользовательская сборка не изменена, аппаратного результата у этого
mixed-кандидата ещё нет. При переносе сохранить root typed `qaJoinedTouch`
constructor option; данный коммит содержит только расширение диагностического
private gate, не включение продуктового пути.

Дополнительный no-overlap контроль: mixed ON и OFF подают одинаковые literal
Plan.prepare bounds/scalars (bloom/radius/water/landedWet/standing/wetPeak/dwell),
folded dry bounds/radius/standing, spacing/direction/diffusePending. 11/1 PASS.
`noteDabSpacing(0)` и `noteDirection(0,0)` только читают ранее выбранные значения,
не сбрасывают их; отсутствие этих вызовов в owned-ветке не меняет состояние.
Захваченный dryCtx — отдельная копия с сохранением физического target identity.
Это контроль параметров без перекрытия; full GPU material oracle остаётся открыт.

### Portable ordinary Room mixed gate (подготовлен, не запускался)

CPU helpers:
`temp/pure-water-plan/causal-trace/joined-mixed-room-function.js`
(SHA256 `87b0766dd40b2a478438e892c96ca0cb2748e4f1f6500756b476fb8ea5a68ccc`)
и `joined-mixed-room-controller.mjs`
(`718f74f60bf35767555c0876a7e3a35f02e5c171351f4ce44a5c7b11722a34bb`).
Оба `node --check` PASS; три отрицательных actor preflight проверки PASS без GPU.

Запуск требует явных QA_APP, QA_RUNTIME, QA_MANIFEST (files:path/sha256), QA_OUT,
QA_DEPS. Controller перед браузером проверяет все manifest SHA, затем обычный
UI Create создаёт отдельную A4 комнату для каждого из шести arm. Один собственный
headed Chrome, один context одновременно, RAM1700/500 MiB, 240s arm bound,
finally закрывает только собственный browser. Порты пользовательских стендов
не разрешены. Источник должен включать fa72+9dda, а не только старый narrow.

Две real native фиксированные gestures: water100/pigment0 → water100/pigment100;
пигмент → другой RGB. Отдельный no-overlap OFF/ON case. Перед input обязателен
Room actor не local и engine._userId === store.userId. Native источник сохраняет
реальный wet sampling; time/packed wet НЕ исключаются из сравнения. Из material
сравнения убираются только верхние id/userId/layerId/timestamp/seq. Различие packed
wet — FAIL данного paired invariant, не повод ослабить критерий.

Фиксируются только физические strokeId/washId, глобальный crypto и operation.id
не изменяются. ACK дополняется ordinary authenticated API /operations: этот
endpoint читает Postgres непосредственно; все actual expected IDs данной комнаты
должны появиться за 30s. Strokes требуют разных настоящих nanoid, журнал никогда
не удаляется и не remap-ится. Ошибка persistence сохраняет expected IDs и partial.

24 роли на tile/field: 14 scratch (original/coverage/P/C/dry/settled/film/bases/V)
+ 10 solver a/b/c/ca/cb/cc/coverage/mask/pressure/band. Null роли записываются явно,
не считаются нулевыми. P/C/V/coverage обязаны иметь nonzero; whole PNG alpha>0.
Сравнения OFF/ON строгие SHA full buffers, whole RGBA и material journal; диагностические
scratch-роли здесь также не получают автоматической tolerance. Whole PNG сохраняется.
Все readback вне active input. Это CPU подготовка: аппаратных результатов пока нет.

### Изолированный mixed runtime, CPU-only

HOME archive:
`/home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/joined-mixed-0250ae51`.
Full root source `0250ae51e5646634109e6d4506d57c6686e10dec`,1007 tracked web/shared
SHA byte-equal, оригинальный Vite config,7 paper assets из проверенного f52 runtime.
`source-manifest.json` и `source-passport.json` сохраняют SHA/provenance/qaHashes.
Archive SHA c011c572a3d41517279bb63908751135311b62ca83768c038be30b6cad574580.
Typed joinedTouch/mixed defaultfalse. Backend4539 не изменён; потенциальный порт5340
был свободен. При подготовке HOME MemAvailable1652MiB<1700: Vite и browser НЕ стартовали.
Новых dependencies/install/worktrees нет, real ancestor deps доступны. Никаких
5330/5329 изменений. GPU у других агентов.

В `qa/next-commands.txt` точные отдельные команды future Vite и GPU controller.
Запуск только после grant/RAM/port/bootstrap health. Основная команда:

```sh
QA_DEPS=/home/suselman/projects/pencil-agents/680-lifetime-hardware QA_APP=https://192.168.1.70:5340 QA_RUNTIME=/home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/joined-mixed-0250ae51 QA_MANIFEST=/home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/joined-mixed-0250ae51/source-manifest.json QA_OUT=/home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/joined-mixed-0250ae51/qa/raw-next /home/suselman/.nvm/versions/node/v22.20.0/bin/node /home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/joined-mixed-0250ae51/qa/joined-mixed-room-controller.mjs
```

Controller использует установленный Chrome/actual DISPLAY0 и отказывает overwrite
старого report. Snapshot of material SHA теперь стабильно сортирует object keys,
но НЕ изменяет packed wet/dab times. Storage poll после ACK сверяет полный actual
accepted payload с Postgres (только server seq дополнительно исключён), сохраняет
storedOperations/expected IDs. API board ID берётся из actual store.room.id.
Serialization test извлекает actual normalization из helper: wet/time/physical
stroke/wash IDs сохраняются, изменение packed bytes/wet не совпадает, actual ID
и walltime остаются в persistence comparison. Этот CPU test PASS на VPS и HOME;
helpers node-check PASS. GPU/physical endpoint данным обновлением не проверен.

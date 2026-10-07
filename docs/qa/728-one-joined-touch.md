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

## Интеграция root, 07.10 16:35

Локальный74118d2e добавляет кандидат OFF. Конфликт exportPNG разрешён с сохранением ранее введённых asyncError guards до/после canonical.ready. Root focused joinedTouch/coverageFilm11PASS, asyncFailureMaterial2PASS; whole-web TypeScript exit0, lint exit0 с прежними предупреждениями, map:check1013files PASS. Это CPU/MockGL проверки, а не аппаратный паритет. Пользовательские стенды5329/5339 неизменны.
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

Root9af712c4 сохранил asyncError guards и captured-gesture expedited-Dry lifecycle при разрешении конфликта _startSettle. Повтор root21tests/4files (joinedTouch, coverageFilm, asyncFailureMaterial, expeditedDry) PASS; whole-web TS0, lint0, map1013PASS. Неуспешный запуск до разрешения merge-конфликта сохранён только как ошибочный preflight и не считается проверкой. Пользовательские стенды не изменены; аппаратное доказательство фиксированного5e80 остаётся обязательным.

## Отдельный DEV вход для ручной проверки

Typed `joinedTouch` defaultfalse устанавливается конструктором до первого job; Room разрешает его только в DEV с `qaJoinedTouch=1`. Обычные URL и production остаются OFF. Это подготовка ручного сравнения после аппаратных gates, не включение пользовательского стенда. Room line budget увеличен на одну строку явного флага.

## Повтор actual Vega на исправленном5e80

41114 EXIT0/CLOSED: same-source OFF/ON, ordinary Room brush400, два фиксированных native pointer tapes, один RGB/preset. Hot secondDOWN GPU completion upperbound546.8→10.2ms, CPU9.7→8.0ms, readwait536.9→2.2ms; penUP56.8→52.5ms в этом прогоне. Ранний70 показывал penUP61.6→106.4ms, поэтому перенос общего барьера остаётся риском, а один быстрый UP не означает общего исправления плавности.

24 полных buffer SHA exact, meaningful P/C/V/coverage; whole transparentRGBA SHA exact,287989 purple pixels обеих сторон, GL0/lostfalse. Material diff paths пусты после исключения только id/userId/layerId/outertimestamp/seq; wet/preset/RGB/packed dabs/times/strokeId/washId совпадают. Raw `728-one-band-room/temp/band-room/joined-fixed-result.json`, root inspected independently. Это не физическое аппаратное перо и не браузерный timestamp презентации; readPixels после DOWN измеряет upperbound готовности framebuffer. UIDry/UndoRedo/fresh/peer и другие GPU ещё обязательны.
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

Root mixed5473c3ec+0250ae51:23focused tests/4files (joinedTouch/coverageFilm/asyncFailure/expeditedDry) PASS, whole-web TS0, lint0, map1013PASS. Diagnosticmixed defaultfalse; no hardware mixed proof yet. Typed049 UI lifecycle55712 verified nonlocal actualactor beforeinput, Dry/Undo/Redo meaningful; fresh remains pending, not yet full gate.

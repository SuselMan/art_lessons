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

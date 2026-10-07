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

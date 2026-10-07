# #728: следующее касание при незавершённом предыдущем wash

CPU-разбор, 07.10.2026. Это проект диагностического пути, не реализованный фикс и не аппаратное доказательство. Пользовательские стенды не менялись. Фактический Samsung census показывал joinedTouch=false; причину задержки именно при ON ещё надо измерить.

Принцип: старый физический оператор сохраняет своего владельца до окончательного composite. Новый реальный deposit использует отдельный scratch; старый land не получает права перезаписать его. Один будущий мазок, без async/material presentation и без изменения solver.

## Почему нельзя просто расширить admission

`Engine._paintDabs` включает recorder только при `settle.scratch === ribbonScratch`. Новый wash получает другой scratch; `RibbonStrokeScratch.getOrCreate` копирует текущий tile в original. Этот tile ещё не является завершённой базой предыдущего wash. Старый Plan.finish делает land, а engine затем рисует старый composite поверх нового deposit. Удержание scratch от destroy само по себе не устраняет потерю нового материала.

При смене слоя `setActiveLayer` вызывает `_clearWash`, который синхронно complete и retire. Убирать complete без отдельного старого владельца нельзя: old job продолжает читать его буферы. Новый слой не конфликтует по tile, но общие fieldCache и complete callback всё ещё принадлежат старому заданию.

## Минимальная следующая ступень

1. Взять immutable old finish до смены preset/color/layer. Lease хранит job identity, scratch, target layer и epoch. Не переиспользовать будущий scratch для старого solver.
2. Создать один future scratch. Настоящий native source рисуется сейчас; лог, wet bytes и sample times остаются обычными. Старый callback пока не уничтожает owner.
3. До первого будущего source начать отдельный bounded command capture. Сохранить порядок, копии vertex/uniform arrays и references только на удерживаемые текстуры. Нельзя считать scalar-copy равным immutable sampler content.
4. После старого Plan.finish **и старого engine composite**, при том же epoch, обновить future.original из завершённого canonical tile. Для другого слоя это обновление не требуется, но owner barrier всё равно нужен.
5. Восстановить будущие source accumulators и выполнить записанные команды один раз, затем пересчитать actual composite. Future Plan.prepare возможен лишь после этого. UP пока честно сохраняет барьер. Третье касание использует прежний complete fallback.
6. Освободить старый scratch после callback и source rebase. При loss забывать GL references, не освобождать их через новый контекст. Экспорт/checkpoint/bake/network snapshot не публикуют незавершённую lease. Undo/clear/remove отменяют физический owner и восстанавливают accepted journal, а не теряют операции.

## Ещё не закрытые зависимости

Recorder sourceNib/sourceBands/sourceField не покрывает `importForeignWater`: там есть direct fieldOp, временные donor scratch, copyTo и clear. После возврата donor уже уничтожен. Поэтому replay только существующего runningSourceCommands для water→pigment нового wash недостаточен. Нужен отдельно удержанный foreign-water import либо повтор импорта из immutable recorded chunks до source replay, с прежним порядком и dedup semantics. Нельзя записать callback на освобождённый temp.

Новый wash начинается с нулевыми ink/color/coverage, но импортированная coverage/V является базой source. Полный clear перед replay уничтожит её; clear только stroke films тоже не восстановит ошибочно захваченную original. Reset должен воспроизвести точное состояние после import и до первого dab. Старый PaperWet commit выполняется на UP, поэтому sampler chronology нельзя заменить временем окончания solver.

Флаг mixed finish меняет finish branch и metadata capture. Его включение для new-wash требует отдельного no-overlap контроля; нельзя считать прежний same-scratch gate доказательством этого пути.

## Обязательные доказательства перед runtime wiring

- CPU: old callback composite → future original update → import → source replay → future prepare, без повторного deposit; stale identity/epoch callback ничего не меняет.
- CPU: natural completion, third gesture, layer switch, export/bake/checkpoint, loss/destroy и Undo сохраняют owners и accepted IDs; unknown sampler lifetime отказывает admission.
- CPU: обычный OFF и no-overlap трассы не меняются; immutable finish color/dryCtx/paints не ссылается на текущие настройки.
- GPU отдельно: один fixed tape OFF/ON, same layer new wash water→pigment и RGB; полные P/C/V/coverage и wet/time bytes, затем Dry/Undo/Redo/fresh. Другой слой — отдельный контроль. Непустые endpoints обязательны.
- Latency отдельно: реальные first pigment pixels после DOWN без тяжёлого readback во время input. Барьер на UP и ограничения одного future owner фиксировать явно.

До закрытия foreign-import/reset зависимости безопасный runtime кандидат не готов. Это не повод включать сломанную provisional presentation или менять физику.

## Уточнение distinct-scratch после source sampler review

Предыдущий план replay donor/source является консервативным вариантом, но может оказаться избыточным. Реальный `RibbonPasses.drawRibbonNibPass` связывает original/inkLoad samplers с paper placeholder; единственная заменяемая текстура — clipTo собственной будущей coverage. Bands читают paper/noise и переданный availableWater. Source field mode1 читает собственные будущие base/film. В отличие от same-scratch, старый Plan.land не пишет ни один из этих future buffers.

Таким образом следующий минимальный adapter-кандидат — удержать **готовый future scratch целиком** (zero additional snapshot bytes), после старого complete+engine composite обновить только future.original из actual tile и повторить future composite. Ни deposit, ни импорт не replay; временный donor может быть уничтожен штатно, его результат уже находится в удержанных future.coverage/foreignSolventLoad. Для другого слоя original сохраняется. Это ещё не доказательство полей: требуется actual Plan oracle, в частности динамических foreignSources и shared-fluid availability.

`Engine._paintRibbonDabs` строит foreignSources из done записей OperationLog с op timestamps, washId, записанными wet/chunks/seed; он не читает old solver V. `importForeignWater` восстанавливает donor из этих chunks. Старый completion сам по себе не добавляет журнал. Однако remote arrival/history reset между двумя source batch и завершением old job может менять лог; lease должна фиксировать уже выбранные source records/границы и не пересобирать их из нового лога при rebase. Настоящие live wet bytes тоже должны остаться bytes первого исполнения, а не пересчитываться по clock completion.

Цену нового scratch всё равно нельзя объявлять нулевой: дополнительные future original/coverage/inkLoad/inkColor плюс lazy film/solvent буферы удерживаются одновременно со старым scratch. Каждый full1536² RGBA8 = 9 MiB. Foreign import marker snapshot пары coverage+foreignSolvent = 18 MiB/marker, поэтому вариант replay/import snapshots требует отдельного общего byte cap; предпочтительный distinct-scratch retain не добавляет эти marker snapshots. Admission обязана проверить общий live budget до input; нельзя принять deposit, потом молча отказаться из-за памяти.

CPU-прототип `docs/qa/harness/728-future-source` пока моделирует более общий ordered replay contract. Его 7 tests не покрывают реальную эквивалентность этого zero-copy сокращения и не разрешают включение runtime.

## Реальный scratch adapter, CPU

`DistinctScratchLease` добавлен в существующий RibbonStrokeScratch.ts, по умолчанию disabled и **не подключён к Engine input**. Он требует distinct live scratch и отдельно удерживает future через callback. Job/epoch/old-layer identity обязательны; same-layer после old composite копирует actual tile в future.original, другой слой сохраняет original. Source/import текстуры не очищаются/не копируются/не проигрываются повторно. Release обоих владельцев exactly-once даже при исключении. Частичный rebase/composite failure сохраняет publication block до scoped cancel и подтверждения authoritative recovery.

CPU гейт: `index.distinctScratchLease.test.ts` + прежний joinedTouch, 14 tests/2 files PASS; whole-web TS exit0. Реальный тестовый Engine выполняет настоящий `_completeSettle` с Plan, затем lease вызывает реальный `AccumulationBuffer.copyTo`. Полные MockGL readback arrays future.original совпадают с завершённым tile; непустые sentinel coverage/P/C/import arrays остаются byte-identical. Это проверяет реальные вызовы, copyback и владение, но **MockGL не моделирует акварельные shader modes**, поэтому не является GPU P/C/V parity proof. Raw: temp/pure-water-plan/future-source/actual-scratch-{tests,types}.log.

Admission reserve является договором будущего caller: он должен заранее ограничить весь reachable physical target и максимальное количество lazy planes. Сейчас input не подключён, поэтому метод не обещает ограничение последующих неизвестных tile allocation. Нельзя подключать только вычисление live byte count после первого dab — это слишком поздно.

## Следующая wiring ступень: убрать барьер UP, сохранив canonical finish

Новый actual trace root показал старый drain на UP: 724 units/30.1ms CPU, затем 800ms RAF gap. Предлагаемый bounded путь использует существующий `captureCanonicalFinish`, а не broken async/material presenter:

- До будущего UP source уже в distinct scratch; UP фиксирует immutable finish metadata/target/preset/color/opacity/scalars и accepted native op как обычно. Один future finish помещается в lease, старый job не complete на UP.
- Natural old completion выполняет Plan.finish, old composite, затем lease rebase и future composite в том же callback. На этот момент старые Plan snapshots disposed; только теперь запускается `_finishRibbonStroke(future, ..., capturedFinish)` и его следующий Plan.prepare.
- Existing Queue.advance обнуляет current **до** complete callback, поэтому successor `_startSettle` не вызывает Queue.start synchronous complete. Прямой Queue.complete рекурсивно drain-ит successor и остаётся явным барьером для export/Dry/Undo/third gesture; нельзя использовать его для этого normal UP.
- Natural completion до future UP только rebase/composite, без преждевременного finish. Future metadata захватывается именно на реальном UP. Scalar wet/time не пересчитываются при запуске successor.
- Scope сначала один predecessor+future WC, sourceFilmRebase ON, async/material/split OFF. New-layer admission дополнительно требует scoped `_clearWash` retirement; до этого layer-change fallback сохраняется. Без реального memory reservation и journal/loss/reveal lifecycle wiring путь не готов к включению.

## Same-scratch joined UP wiring: диагностический OFF

`_wcJoinedFinishDeferred=false` оставляет старый UP barrier. В ON, только при existing joinedTouch lease и захваченном immutable old finish, реальный UP фиксирует один future finish; старый solver остаётся current. При natural completion old Plan.finish/source rebase и canonical composite выполняются до `_resumeJoinedDeferred`, затем запускается owned future finish. Async/material/split не включаются. Chunk boundary с fade=false и third touch сохраняют explicit drain.

Future metadata deep-cloned через existing captureCanonicalFinish. Actual newly folded dryCtx передаётся в prepare отдельно от frozen finish; source/wet clocks не пересчитываются. Будущий scratch удержан до запуска finish. Old callback guarded epoch+exactonce, loss/cancel не оживляет его. Accepted операции не удаляются. UI `paper_dry` через OperationLog завершает old и future в порядке, затем закрывает wash; это всё ещё явный тяжёлый барьер.

Pending/failed publication закрыта для PNG/review/preview/fullreplay/network bake и checkpoint. Error/invalid target/solver-unit failure ставит layer recovery; marker снимается только после actual authoritative replay `_noteReplayedOrder`, а не по одному отсутствию current solver. Thrown null тоже закрывает публикацию через recovery set. Queue error callback optional, cleanup exactly-once; при одновременно operator+cleanup failures AggregateError сохраняет исходную cause. Ошибка старой scheduleFieldRelease не уничтожает уже созданный successor.

CPU final: 43 tests / 4 files PASS, whole-web TS exit0; `index.joinedDeferredFinish`, `index.joinedTouch`, `index.distinctScratchLease`, `WatercolorSettleQueue`. Actual Engine/Queue/Plan MockGL, НЕ GPU physical byte parity. Raw temp/pure-water-plan/future-source/deferred-{tests,types}.log. Runtime/private flag не включён ни на одном стенде, GPU не запускался.

Это перенос работы, не уменьшение числа 724 solver units. Будущий аппаратный гейт обязан отдельно измерить UP handler, UP→RAF tail/max gap и полную settle duration, затем same-tape field/wholeRGBA/Dry/UndoRedo/fresh endpoints. New-wash/layer admission этим коммитом не включается.

Интеграция с текущим root требует ручного сохранения releaseDryTicket/isExpedited/captured gesture в `_startSettle`, а также уже существующих root asyncError/export guards. Эти поля отсутствуют в старой базе данной рабочей ветки; нельзя заменять root файл целиком.

### Отдельный constructor opt-in

`PencilEngineOptions.joinedFinishDeferred` по умолчанию false. Room читает этот параметр только из DEV `VITE_QA_JOINED_FINISH_DEFERRED=1` или `?qaJoinedFinishDeferred=1`; production query ничего не включает. Опция сама не включает joinedTouch, async или material; для будущего собственного QA адреса нужно отдельно существующее root `qaJoinedTouch=1`. Все работающие стенды неизменны.

CPU option gate: 13 tests / 2 files PASS, whole-web TS exit0. Raw deferred-option-{tests,types}.log. На root net cherry сохраняет его уже существующий typed joinedTouch и Room DEV helper; wholefile из старой базы не переносить.

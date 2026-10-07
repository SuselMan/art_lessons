# #728: расчёт мазков перед окончательной очисткой

CPU-кандидат от root `4ad7dfc9`, ветка `agents/728-clear-prefix-elision`.
Принцип cross-device-determinism: весь Operation Log, записанные дабы, вода,
Undo/Redo и серверное покрытие сохраняются. Только физическая работа, которая
окончательная очистка перезапишет, может не выполняться при первом replay.

## Сохранённое измерение тяжёлой комнаты

Исходный47-operation material journal сохранён в root
`temp/night-728/load-fallback/actual-no-snapshot-report.json`, source47f1d339.
Настоящий ordinary join, серверный snapshot действительно отсутствовал:
cold13.163s/warm12.447s; 41stroke append calls, JS inside11.323s/10.829s.
Это прежний source и локальный настоящий материальный fixture, не текущая
production latency. Не выдаём его за измерение current4ad7.

Перед layer_clear seq11 девять stroke seq1..5,7..10. Их append CPU составил
1.511s cold/1.142s warm. Один из них уже подавлен существующим undoneInBatch;
новая оптимизация касается ещё восьми. Эти числа включают nested/submit работу,
не являются GPU duration или доказанным будущим выигрышем.

Stored counterpart, source168270c1: cold1.670s/warm1.217s, stroke replay0;
restoreLayerFromSnapshot55/70ms. Оба endpoint совпали с независимым full-history
oracle. Наличие сохранённого bitmap уже является главным различием этих путей.

## Конкретный шов

restoreRoomState ныне передаёт undoneInBatch в setUnpaintedInBatch. Engine
логирует stroke до skip branch и сохраняет его done; clear удаляет pixels и
paperWet. Новый helper добавляет туда только overwritten stroke IDs.

Опция diagnosticClearPrefixElision отсутствует/false по умолчанию; ни один
production Room caller её не включает. Допуск только для первого fresh join,
alreadyHadSeq0, latestSnapshotSeqnull, пустого engine log, полной упорядоченной
seq1..knownHead цепочки. Catch-up, снимок и неполный prefix используют обычный
replay. Fresh mount обязан действительно владеть новым engine; этот эксперимент
не даёт права применять skip к вручную восстановленному старому engine.

Helper разрешает только watercolor stroke на уже существующих слоях,
layer_clear, paper_dry и same-author undo известных stroke. Любые структурные,
copy/merge/image/area/sample/smudge/unknown tool, redo/revoke, undo clear или
unknown history target выключают elision целиком. Сохраняется весь gesture или
wash, если хотя бы один его chunk переживает clear. Не удаляются/переписываются
дабы/wet/timestamps, clear и Dry не пропускаются, snapshot coverage не создаётся.

## CPU проверка и следующий gate

21 тест в3файлах PASS. Pure planner: metadata/gesture/wash/layer/author/seq и
опасные readers. Real Engine: suppressed stroke остаётсяdone; все операции
логируются в порядке. Later Undo/Redo clear запускают настоящий sliced rebuild,
в истории которого остаётся suppressed stroke. DefaultOFF, catch-up, snapshot,
already-held и head-gap показывают обычное количество paint calls.

Это проверка реального выбора/планирования replay в MockGL, не физический GPU
oracle. Retained census `temp/qa/retained-census.json` выбирает ровно девять
исходных IDs перед seq11. Следующий обязательный отдельный hardware gate:
current immutable same47 packedjournal OFF/ON, meaningful final P/C/V/coverage
и wholeRGBA, ordinary Undo clear/Redo/freshjoin, фактическое число пропущенных
physical calls и separate wall timings. До этого defaultON не предлагается.

Whole-web TypeScript PASS в отдельном private mirror на существующихdeps;
oxlint --fix/diff --check PASS. map:check996files PASS; map:rules0errors,
5 существующих предупреждений. Логи сохранены в temp/qa. GPU не использовался,
стенды/сервер/user tabs не изменялись.

## Диагностический GPU runner: незавершённые попытки

После CPU-проверок родитель разрешил отдельный immutable runtime ca0b6129
на Samsung SM-T970 (Adreno), порт5330. Все989 tracked web/shared SHA
совпали; исходные пользовательские стенды не менялись.

- `temp/clear-prefix-gate/runs/clear47ca0_1791359395489/report.json`:
  четыре served source SHA совпали, затем CDP evaluate timeout15s до
  диагностических данных. OWN1429 закрыт. INCONCLUSIVE, не регрессия кандидата.
- `temp/clear-prefix-gate/runs/clear47ca0_1791359639637/report.json`:
  исправленный async kickoff и один rAF между append сохранили все47 операций.
  OFF дошёл до meaningful final P/C/V/coverage/cost; target47 finish1,
  carryP14, front126. Проверка ошибочно требовала mode16 для single-paint
  job, хотя Plan529 создаёт colour только при paints.size>1. OWN1430 закрыт.
  ON/Undo/Redo ещё не выполнялись; byteidentity и ускорение не подтверждены.

Следующая подготовленная проверка требует targetmode16 условно по фактическому
finishMetadata/scratch paints.size, targetmode15/front и nonempty P/C/V/coverage
всегда. Timing включает диагностический rAF dispatch cadence и не равен
буквальному времени загрузки Room. Field readback вынесен в отдельную
correctness-волну. Повтор аппаратного запуска ожидает review родителя.

Третья попытка `clear47ca0_1791360028954` дошла до OFF seq47 с
paints.size=1, front126/carryP14 и meaningful четырьмя каналами. Однако
диагностический sequence не был обновлён перед Undo, поэтому rebuild
повторно попал в target47 capture и вызвал duplicate guard. Собственная1431
досрочно закрыта, controller terminalEXIT1/finallyclosed. Это ошибка fixture;
ON и полный Undo/Redo gate по-прежнему не подтверждены. CPU runner теперь
обновляет sequence48/49 перед этими двумя операциями; исходный renderer
и полный сохранённый журнал не менялись.

## Ограниченный same-journal Samsung gate: PASS

`temp/clear-prefix-gate/runs/clear47ca0_1791360791885/report.json`:
immutable ca0,989tracked SHA exact,4served source SHA exact. OWN1432 закрыт,
controller26599 EXIT0; cached CDP после завершения own target не содержит.

Все17 физических карт (cost + четыре tile × P/C/V/coverage) и три
wholeRGBA final/Undo clear/Redo byteexact: changed0/max0. Ненулевые P/C/V/cov
и реальные targetcarryP14/front126; targetpaints1, поэтому mode16 на этом
job не нужен. Undo восстанавливает1,362,943 отличающихся RGBAbytes и1,784,736
nonempty pixels; final1,580,675. Redo возвращает original final exact0.
Full47 остаётся в Operation Log. ON skips10vsOFF2: восемь дополнительных
stroke не рисуются; actual initial paint calls31vs39. Во всех4arms GL0/lostfalse.

Чистая timing-волнa без промежуточных readback: OFF41.115s/ON35.359s.
Это standalone canonical replay с одним rAF между append; cadence входит
в wall time. Не ordinary Room latency, не native FPS и не production speedup.
One-shot диагностический capture CPU проверен: original47/rebuild47/Undo48/
Redo49 дают ровно один capture; исходные finish вызываются во всех случаях,
включая исключение capture. Прежние три INCONCLUSIVE сохранены.

Source audit multi-layer: actual target buffer выбран по op.layerId; cache
требует cached.target===target. Painter.resolveWithinSheet и scratch.getOrCreate
читают только этот target. ForeignSources фильтрует same-layer canonical done
ops. Replay использует записанный op.wet; author sampleUnderNib читает отдельную
_layers.get(layerId). Это поддерживает изоляцию исходниками, но отдельного
multi-layer physical gate ещё нет. DefaultON не предлагается.

Новый optional hook forwarding позволяет диагностической зависимости пройти
useRoomRestore → actualrestoreRoomState. Real hook/real MockGL Engine regression:
unchanged render сохраняет callback identity и не запускает дополнительный
restore; opt-inpaint1/fullhistory3, undefinedpaint2. 22tests4files, whole-web TS
и targeted lint PASS. Production Room caller не включает эту опцию.

### Подготовка обычной загрузки на объединённом c092

Обычный Samsung Room controller использует source c092bb925532de903fcaf61d50bced6cb39766d8
(990 файлов совпали), с одной объявленной QA query overlay в Room caller. Лог
содержит все исходные47 операции; реальные socket ACK и server operations проверены.
В новой локальной комнате SNOONay_ подтверждены A4/Fine1754×2480/#fdfdfc, отсутствие
snapshot index (204), unchanged packed dabs/wet/timestamps и seed bitmap с
1 580 675 непрозрачными пикселями, GL0/lostfalse. Default flags: asyncfalse,
zeroContactstrue, phasefalse, fibresfalse.

Первый1445 отказал до комнаты из-за fixture попытки сериализовать DOM object.
После Boolean(await expression) CPU проверки второй запуск завершил seed, открыл
fresh ordinary reader1447 и получил15s Runtime.evaluate timeout во время настоящей
загрузки. Exec34159 EXIT1;1446/1447 закрыты вfinally. Последний отдельный пассивный
опрос seed до его завершения показывал47ACK/pending0/rebuildJobs1, но не является
состоянием уже открытого fresh reader. Raw ordinary47_1791365784081 сохранён.

Это **INCONCLUSIVE**, не ordinary-load timing PASS и не regression helper. Bitmap
bootstrap, stored rejoin и обычный Undo/Redo ещё не пройдены. Следующий прогон
требует проверенного bounded CDP deadline для долгого restore; не отключать работу
движка и не удалять историю ради результата.

### Ordinary bootstrap проверен на c092

После review сохранённый seed SNOONay_ использован повторно без повторного
рисования. OFF ordinary reader1448:52.315с от начала создания/навигации своей
вкладки до47 ACK/idle, actualpaint39 и полный RGBA17 399 680bytes совпал сseed.
Undo48 восстановил1 362 943 отличающихся байта; Redo49 exact0. Настоящий
bootstrap затем опубликовал один nonempty layer-1 bake, POST200 seq49. Fresh
stored reader1449:5.017с, actualpaint0, coverage49, полная логическая история49,
1 580 675 nonempty pixels, wholeRGBA exact0/GL0/lostfalse. Snapshot hash
b4f56380bf2e72958f12d50a6efa76fbbe5ea906db2ab004a8ddd9eedf777f93.

Это обычный Socket Room pipeline и реальный серверный bitmap, не standalone
engine. Наблюдаемая разница больше10×, но последовательный порядок/cache и
включённое создание вкладки не позволяют заявлять строгий causal load benchmark.
Source c092 не включает более позднюю root физику800f. ON новыйCreate1450 получил
fixture Illegal invocation до seed; сравнительный OFF/ON ordinary elision
остаётся pending. Exec94402 EXIT1,1448/1449/1450 CLOSED. Полный raw и компактный
off-complete-summary.json сохранены в ordinary47_1791366235739.

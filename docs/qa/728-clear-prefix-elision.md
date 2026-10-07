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

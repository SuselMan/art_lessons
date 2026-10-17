#787: отложенная промежуточная картинка — границы безопасного кандидата

Readonly по integration d32f8e66/6cd frontend, без runtime изменений/GPU прогона.

В `PuddleRoomController.accept` существующий `host.deferPresentation(target)` уже сохраняет scratch, tile/context и dirty, пропуская render(next), presentation.acceptInput, raw-copy и present. P/C/coverage/solvent/original остаются источником материала. `resumePresentation` рендерит актуальный raw baseline для следующего live INPUT; при готовомgoal начинает показ сgoal. Исправление raw baseline после solved-hidden уже интегрировано ранее и имело native OFF/ON proof. `canonicalTiles`, close/Dry и structural canonical reads продолжают запускать обычный solver, а не берут устаревший transient framebuffer.

Текущий `_deferM70Replay` target-local lease используется `_replayInto` и sliced rebuild, но не первоначальным historybatch через suspendDisplay. Поэтому1001materialRender на1000штрихов ожидаемы. Возможный отдельный кандидат — optional target-local lease на срок конкретного hydrationbatch с окончаниемfinally; сложные границы ordinarytools/Dry/hide/merge/copy обязаны читать canonical material обычным путём. Нельзя просто пропустить `accept` целиком или лениво не выставитьdirty/context.

Это не новый solver/cache и не повод сейчас включать defaultON: профилированный accept/finish bucket539.9мс уже включает render410.5мс и частьвсегоribbon9.489с;86000основныхmaterialdraws такаяоптимизацияоставит. БезEXT нельзя оценитьGPUвыигрыш по этимwallзначениям. Утверждатьускорение12.8с основанийнет.

Existing CPU regression `PuddleRoomController.residency.test.ts` проверяетexactbyte rawbaseline и nextlivebeforeUP OFF/ON, но его renderer — strict source-P copy, solver/mockpresentation не являются настоящимиM70 shaders. Поэтому он полезен как lifecycle proof, НЕ как новое доказательство exact реальныхP/C/solvent/target. Дляпродвижения потребуется native OFF/ON rawfields+target при том жеinitialhistory и границах, а не ещё одинMockGL-only PASS. Доотдельногорешения новый hydrationlease не реализован.

Альтернатива responsiveness: history dispatchприdisplaySuspendDepth>0 исчерпываетвесьgenerator синхронно, тогдакакslicedremote/rebuild ужеимеет_runSlice/TDRguards. Переводinitialhistory наboundedchunking может уменьшитьподвисаниеUI, но не уменьшает суммарныедепозиции; asyncграницы/owninput/snapshot/roomready являются отдельнымпротоколом. Нельзя выдать раннийpartialfirstdraw заускореннуюготовность. Безизолированногопредметноготеста это неузкаябезрисковаяправкаэтойночи.

Вывод: текущийузкийread-onlyаудит не дал доказанного существенногоruntimefix. Никакихphysics/depositionшагов, округлений, clockprotocol, cache/ownership контрактов не изменено.

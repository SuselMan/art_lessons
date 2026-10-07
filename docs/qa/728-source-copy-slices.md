# #728: diagnostic source-copy scheduling

Принцип: cross-device-determinism. Operation Log, геометрия, дозы и порядок GPU material commands не меняются; меняются только границы существующего sliced generator. Flag `RibbonStrokePainter.diagnosticSourceCopySlices` выключен по умолчанию и действует только при `pieceTris > 0`.

После solvent sourceField (V) генератор отдаёт площадь scissor. После двух соседних sourceField (P/C) отдаётся суммарная площадь, без yield между P и C. В deferred-composite ветке pending bounds, damage и live-composite metadata фиксируются до yield. Выбор captured при входе и передаётся segmented recursion, поэтому изменение diagnostic flag между resume не меняет текущую работу. Новые owners и буферы не добавляются.

CPU: настоящий Painter/context OFF/ON command order совпадает в deferred и immediate composite; P/C pair атомарна; native unsliced path полностью совпадает. Auxiliary teardown destroy/context-loss проверен с flag OFF/ON. Дополнительные actual-generator тесты доходят ровно до V и до полной P/C пары, затем делают Queue.cancel/генератор.return или context-loss. После teardown Queue.advance/complete и повторный return не выполняют поздних field writes/composite; owner abort/destroy один раз, следующая работа очереди выполняется после cancel. Fixtures явно включают EXT_blend_minmax: без этого MockGL не достигает film P/C, поэтому прежний слабый order fixture дополнен. Actual GPU fields/PNG и new-touch lifecycle остаются необходимыми до включения.

Основание — Samsung diagnostic1367: ранняя drawing coroutine unit 59.5 ms содержала 18 fieldOp mode1, но это не доказательство стоимости конкретного shader. Структурный рост drawing continuation ops и CPU sourceField caller census относят семью к RibbonStrokePainter, до Plan preparation. Тяжёлый CPU census сохранил данные, но завершился Vitest timeout и не считается PASS.

Это не исправление Surface active drawing: в исходном Surface наблюдении `_runSlice` не вызывался. Нативный путь `pieceTris=0` не изменяется. Hardware gate пока не выполнен; производительность не заявляется.

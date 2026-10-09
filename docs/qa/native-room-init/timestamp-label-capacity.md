# Label и предел первого material job

| Label | Producer |
|---|---|
| Canonical waterFront / diffuse | CanonicalFieldPasses.dispatch, точный kernel kind |
| Canonical fieldOp N | CanonicalFieldOps.run, точный mode N |
| Canonical basic fieldOp N | CanonicalFieldBasic.run; отличён от полного fieldOp |
| Canonical costDomain | CanonicalCostDomain.run |
| Canonical resample N | CanonicalResample.run |
| Canonical brush paired / single | CanonicalBrushContact paired/single encode |
| Canonical stamp / ribbon + phase + coverage/pigment/color | source encode; descriptor metadata DEV-only |
| Canonical composite | CanonicalComposite.encode |
| Canonical clear full / rect | backend.encodeClearField |
| Diagnostic paired carry / static front cache prepare | отдельные OFF variants, не выбранные в этом сценарии |

Source/settle/live pass внутри adapter.runQuantum охватываются recorder, но full long2 capture отвергнут: два material job уже требуют более 1024 pass. Bridge publication создаёт encoder вне adapter и здесь не измеряется; copy/upload вне pass тоже исключены. Нельзя назвать долю всей стоимости до замера.

Выбран узкий заранее объявленный FIRST material request: existing observer prepare:start включает окно, finish:done выключает. Query set создаётся до ввода; source и следующий job остаются вне окна, порядок и quantum прежние. Observer prior сохраняется и восстанавливается до снятия основного marker probe. read/map только после всего ввода и canonical idle.

CPU `timestampCapacity.test.ts` исполняет исходный canonical plan без GPU на1024 extent, long40031 travel points, max wet/bloom, radius120/160/200 и mixed/film/foreign матрице24 вариантов. Получено749–834 pass одного job; дополнительный native finish composite даёт оценку максимум835. Это conservative fixture estimate, не реальный measured count и не формальное покрытие любых жестов. Capacity1024 оставляет189 slots; overflow остаётся отказом диагностического запуска. Фактический первый job обязан подтвердить meaningful labels и bounded count перед признанием результата. Расширять лимит или менять алгоритм для попадания в лимит нельзя.

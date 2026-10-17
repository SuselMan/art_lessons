# #779: ранее защищённая вода после обратимого material boundary

Подтверждённый baseline: Awater→Dry(C)→Bwet→UndoDry→UndoA уже даёт Awater0+B.
Затем RedoDry убирает Awater, а немедленный UndoDry ошибочно не возвращал её.
Это точечная сохранность УЖЕ установленной eligibility через reversible boundary
cycle без новых consumer/branching. Одинаковые raw states НЕ являются общим
инвариантом: foreign stroke, нарисованный после полного UndoA, не получает Awater.

Та же ошибка отдельно воспроизведена для pencil/shape/layer_clear/layer_delete.
Последний проверен с B после UndoDelete, то есть без рисования на удалённом слое.
Hide, массовый hide и legacy global Dry используют ту же границу закрытия source.
Copy/merge не добавлены: у них отдельный historical-read contract.

Исправление использует существующие eligibility/reactivators из журнала, без
новых protocol/LogEntry fields. При Undo реально закрывающей material operation
допускается повторная проверка только прежней whole-water source. Её ранее
наблюдавшийся historical component должен иметь members до И после boundary
на том же слое. Нельзя требовать только source<boundary<foreign: whole gesture
может содержать bridge-chunk после Dry к B до Dry; либо connector до Dry может
связывать source/foreign, оба нарисованные после Dry. Оба направления имеют
отдельные baseline FAIL и regression PASS.

Повторное включение кандидата — не сохранение воды автоматически. Existing
resolveGeometry заново проверяет старые допустимые consumer, active connectors,
geometry, Dry и 120s. Для proof новые gesture не являются мостами: только
clock-only zero-water projections сохраняют их refresh исходного layer clock.
Это временный локальный proof input; material replay получает original operations.
Без этого mask interval-only вариант ошибочно оживлял A через новый replacement
bridge после удаления прежнего. Теперь negative blocked; альтернативный активный
оригинальный connector разрешён. Исходные операции/пигмент не меняются.

Проверки: три цикла Dry/hide author A/C; whole chunks; nested Dry; fresh full
history и поздний prefix backfill; natural expiry; consumer undone; новый consumer;
other-layer Dry; удалённый bridge/new replacement; alternate original bridge;
дальний nonconnecting layer-clock refresh. Независимый малый discs/BFS oracle:
500 seed×20 actions, 10000 prefix comparisons, три автора/два слоя/scopedDry,
Undo/Redo/ветвление. Oracle не использует production geometry/spatial/cache;
он ограничен single-disc/single-chunk и коротким временем, остальные corner cases
покрыты отдельными regressions. GPU accuracy этим не сертифицируется.

CPU-риск: historical geometry proof выполняется на dormant candidates при Undo
boundary; существующая presentation/GPU solver не менялась. Длинные комнаты с
многими такими sources требуют отдельного измерения, latency hardware не заявлена.

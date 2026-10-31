# Негативный public frontier straight read-only engine

Отдельный host-only suite конструирует настоящий PencilEngine через штатный
createTestEngine с explicit straight rasterVersion и canonicalEmptyRoom.
read получен actual prepareCanonicalRoomState на закрытом empty-cut0 свидетельстве,
tail — исходный exact массив. Не меняется private rasterVersion и нет фабрики
поддельной authority. Helper сам произвольных слоёв не создаёт: регистрируются
только shared IMPLICIT_LAYER_IDS. Это client authority contract на mock wire,
а не доказательство физической DB (его cross-layer smoke находится apps/integration).

Проверки вызывают реальные публичные writer APIs с допустимыми операциями:
append/undo/redo/clear/confirm/discard, topology/dry, peer-live с public arg3=true,
preview даже при contextLost, area/shape/filter, snapshot/history и bakes.
Проверяются не guard internals, а отсутствие delegate вызовов, journal revision,
GL draw/texture allocation, author enqueue, preview/local callbacks и peer state.
Cleanup entrypoints могут возвращать пустой результат или отвергать вызов, но не
должны запускать legacy smudge/settle/paint. setLocked(false) + настоящий pointer
start/move/end/predict через existing helpers остаются inert. Unknown initLayer
отвергается до allocation/base mutation, implicit layers разрешены.

Tests-first: 6 ожидаемых constructor rejection до implementation новой опции.
После admission API: 8 tests, 6 meaningful public-frontier отказов и 2 PASS.
Pointer witness ждёт paperReady и очищает наблюдения легальной загрузки, прежде
чем setLocked(false) запускает ввод. Identical ready-input positive control
штатного PM конструктора реально рисует, записывает и emits один stroke;
поэтому readonly pointer no-op не объясняется непрогруженной бумагой.
Production index и positive/RebuildJob suites принадлежат другому owner и этим
изменением не правятся. Только host/mock GL, без device/full-editor claims.
Логи R52/canonical-readonly-*.log; vitest всегда --maxWorkers=2.

Final paired graph: 8 tests PASS after actual original owner captures immutable
room geometry and production guards are installed. All readonly fixtures await
paperReady BEFORE writer GL observations: legitimate asynchronous paper display
cannot masquerade as a forbidden operation draw. Pointer test still explicitly
checks ready input, and PM positive control remains real. Final log
R52/canonical-readonly-green.log; no production changes in this test unit.

# Показ законченного canonical prefix при непустой очереди

SAME coordinator хранит один completedPresentationRevision, изначально -1. Публикация происходит только после завершения последней dirty position и закрытия её plans. publishedPresentationReady требует существующую presentationReady и хотя бы одну завершённую публикацию; это исключает пустой derived сразу после constructor/enqueue.

Engine использует отдельный visual-only gate для _display, current StraightLayerPresentation и compositor displayLayer. _canonicalReadable/read/export/snapshot/pickColor guards не ослаблены: очередь всё ещё закрывает эти чтения. После нового завершённого prefix SAME layer owner запоминает последний запрошенный revision и вызывает существующий coalesced rAF display, сохраняя SAME painter job. Preparation-only turns не повторяют request. Awaiting recorded order и terminal retirement прежние. Нового scheduler/queue/cache/buffer нет.

Tests-first actual engine: baseline intermediate display witness FAIL при 15 PASS. После исправления 17 owner tests PASS, включая nontransparent stable seed, два original queued frame, отсутствие composite до первого fold и на dirty turns, показ completed fold при queuedFrameCount>0 с сохранённым job, закрытые pick/snapshot/read, duplicate revision без display, потерю контекста из existing display-rAF callback с CPU cleanup0 и сохранённым journal. Тесты явно flush настоящий existing rAF между painter turns, после удаления initial pending display из наблюдения; они не доказывают, что rAF всегда успеет между MessageChannel turns на устройстве.

Исходный Samsung receipt frameP95 194.6ms — интервал вызовов display, а не blocking CPU duration; median displayMs2.4ms. Изменение не добавляет synchronous display/gl.finish. Actual Samsung before/after нужен отдельно: число presented frames/maxgap, pointer-to-visible, drawWall, CPU/GPU/resource cleanup. Если rAF starvation сохранится, отдельного review требует park SAME painter до consumption, а не скрытая новая очередь.

Журналы pending-preview-*. Новых ресурсов устройства/процессов unit не создаёт. Memory audit отдельно: canonical-pending-preview-perf-audit.md.

Итог: 249 тестов/8 suites PASS; app-only TSC18101 PASS (SW неизменён, последний общий40346 PASS); точечный lint exit0 с прежними index warnings и diff-check PASS. Устройство в этом host unit не использовалось.

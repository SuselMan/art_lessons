# Четвёртый owner после полного idle: результат Surface

Immutable QA source `4f39e157df31c6d3d03114cb7ad752131048d329`, finite/float OFF, direct early Q8 ON. Один разрешённый запуск; повторов нет.

Функциональная часть подтверждена: четыре реальных старта через PointerInput, дополнительных finish на DOWN — 0, существующих sync-return — 16. После окончания admitted=0, mainFree=previewFree=3, submitted=completed=8286. GL error=0, context lost=false, page errors отсутствуют. RAM: до 2159, минимум 974, после закрытия собственных страниц 1595 MiB.

**Общий verdict FAIL**, поскольку строгий контроллер сохранил console resource errors 403 и 404. Финальный endpoint readback расположен после проверки ошибок и не выполнялся; endpoint/replay parity не доказаны. Четыре packed операции и частичный trace сохранены отдельно. Это не доказательство четырёх одновременно активных owners или непрерывного рисования без ожидания.

Все четыре операции имеют один washId. Production `PencilEngine` сохраняет wash до 100000 ms при пересечении с мокрой бумагой; полный GPU idle не равен высыханию PaperWetness. Сценарий разрешает новый wash после полного idle, но не принуждает его. Четвёртый DOWN выполнялся после пустой owner map и свободных трёх слотов.

Серверный журнал в временном окне запуска связывает единственный 403 с POST `/api/rooms/:roomId/thumbnail`. Это точная серверная корреляция, а не доказательство идентичности browser console message: первоначальный контроллер URL не сохранял. URL 404 неизвестен. Поэтому whitelist не включён, общий FAIL сохранён. Новый offline controller сохраняет bounded response status/path/method/resourceType и console location, без query/auth данных; любой console error всё ещё отвергает запуск.

Диагностика: `temp/fast-watercolor-night/owner-reuse-fullidle-surface-20261009/report.json`, packed tape, partial tape и failure PNG. Приватные адреса не входят в отчёт. Surface освобождён; новых аппаратных запусков нет.

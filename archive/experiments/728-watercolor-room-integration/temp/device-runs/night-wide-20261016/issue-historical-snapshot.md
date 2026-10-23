Кампания #745. Отдельное подтверждение исторического источника copy/merge, смежное #750.

Создать source со штрихом A, duplicate(source), затем добавить в source второй штрих B. Восстановить source из более нового snapshot, содержащего A+B. Full replay старой копии ошибочно выбирает pinned snapshot оригинала и добавляет в копию поздний B, которого на момент duplicate не было. Живая копия по-прежнему содержит только A.

Engine regression index.historicalCopy.test.ts (случай does not seed an old copy from a newer source snapshot) проверяет фактические пиксели; baseline failed, предыдущий future-undo regression passed. Локальный baseline copy-late-snapshot-baseline.log.

Исторический replay обязан читать исходный префикс, не будущий базовый снимок. Исправление отключает нынешние checkpoints для исторического source replay и оставляет обычные rebuild/checkpoints без изменений. Возможное дальнейшее ускорение — выбирать только доказанно более ранние снимки, не ослабляя границу истории.

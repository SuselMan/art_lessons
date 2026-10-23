## Сценарий

Длительная комната4s7MGr88:3 физических GPU (AMD laptop, Intel Surface, Apple iPad Safari16.3) +17 independent Socket.IO guests, ровно20 участников. Все9 инструментов, каждые5мин собственные undo/redo участников; уже2676+ операций.

## Факт

Phase4 послеreload и возобновления нагрузки: iPad tailMax1283ms после pen-up; повторные хвосты300–500ms. Surface tail до500ms.

Runtime `gl.readPixels` probe: последний bounded100 slow calls на каждом устройстве, все1024×1024/active=false. Все100 stack = RibbonStrokeScratch.spillWork → spill → _evictChunk → _trimChunkCache → _replayChunkScratch. Максимум AMD160ms, Intel310ms, Apple836ms за одно чтение. Evidence saved readbacks-phase4-1802.json/loglong-session-phase4.

Sliced rebuild `_inJobStep` заставляет `_trimChunkCache` использовать синхронный spill, потому что REPLAY_RIBBON_CHUNK_SLOTS=4. Один spill содержит несколько полных readback и packing; это нарушает смысл распределённого восстановления и блокирует следующий кадр.

## Ожидание

Undo/redo и catch-up в20-person room не должны выполнять длинную цепочку синхронных readbacks между кадрами. GPU/CPU бюджеты и продолжение wash/gesture сохраняются, картинка послеreplay совпадает.

## Связь

#697 исправляет18independent preview composites; этот путь отдельный, сохраняется послеcoalescing. #700 stale LOD исправлен, не отвечает за эти задержки. Возможное исправление требует доказать сохранение carried wash/continuation, а не просто поднятьcache/memory budget или забытьpaint state.

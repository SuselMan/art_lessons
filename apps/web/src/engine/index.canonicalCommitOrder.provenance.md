# Парковка частичного commit до recorded order

Actual-engine host regression использует genuine prepareCanonicalRoomState baseline1025×8 и обычный fixed native pointer x1020. Реальный wash затрагивает два tiles. Наблюдение существующего composite.drawSource переводит тестовый clock за turn budget после первого stable tile: owner сохраняет entry.ownership, tile=1, committed=false. Новый настоящий pointer/BEGIN создаёт вторую local entry без firstSequence. Оба source-жеста выдаются существующим CPU FIFO; никаких clear/evict/поддельных frames или geometry overrides нет.

До исправления unknown-order barrier останавливал commitFrontier, но advance переходил к present: точный raw texture первого уже частично committed жеста снова накладывался поверх stable. RED8034: ожидалось0 таких presentation draws, получен1. Это host command-order proof, не physical GPU/native pixel proof.

Derived coordinator.awaitingRecordedOrder использует только существующий frontier/ownership/targetPlan/tile/part. При блокировке частичного commit presentation и дальнейшая deposition приостанавливаются; unknown-global barrier сохранён. Existing physical preparation priority остаётся первой, чтобы завершить уже принадлежащие executor tickets. Dirty/pending не очищаются, presentation/checkpoint/export readiness остаётся false.

PencilEngine сохраняет SAME RebuildJob в существующем owner/map и отмечает его parked phase одним scalar на этом owner. Нет нового job/queue/registry/poll. Original confirmation и local author handoff уже вызывают _wakeCanonicalLayer; теперь они могут возобновить SAME parked job. CPU author FIFO остаётся независимым. Parked flag отличается от wake===undefined, чтобы реентрантный callback внутри активного turn не создавал дублированные wakes.

GREEN95463: оба настоящих author-жеста выдаются; partial owner имеет no wake, scheduler не получает новых работ в течение30ms; original first-sequence второго жеста возобновляет тот же job, первый commit завершается и оставшиеся original frames доходят до чистого journal/checkpoint. Все CPU charges после destroy0. Production guards/Room routes/device/runtime не менялись.

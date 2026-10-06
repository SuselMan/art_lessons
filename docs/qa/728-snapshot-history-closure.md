# #728: зависимости истории при восстановлении снимка

Принцип: сохранённые пиксели неизменны, но поздний undo/redo/revoke может изменить операцию, уже включённую в них. Выбор покрытия вычисляется заново для входа; хранимый blob и coveredSeqByLayer не удаляются и не переписываются. Используется сохранённый снимок раньше первого изменённого target либо восстанавливается только затронутый слой. Прочие слои сохраняют ускорение.

## Доказанный исходный сбой

Комната P8TL9XaE, физический Custom 640×480, source 18018025. Реальный снимок layer-1/5 содержит undo5 цвета3. Redo6 возвращает цвет текущим участникам, но обычный перезаход оставлял цвет отсутствующим: восстановленный результат отличался на 22784 пикселя, max255. Полный исходный журнал17 в чистом движке точно совпал с текущим участником. Исходные артефакты HOME680-lifetime-hardware/temp/multiplayer/default18018025-stable-keys и default18018025-fresh-oracle сохранены. Это не сравнение независимо нарисованных мазков.

## Кандидат

- snapshotReplayPlan выбирает покрытие по original target seq, включая равенство; undo5 включён в snapshot5, redo6 уже меняет его.
- snapshotReplayLoader разрешает холодные target IDs и подгружает только требуемые слои и лёгкую структурную/history metadata. Источники merge/copy замыкаются рекурсивно. Socket tail и HTTP index используют один алгоритм; join подготовлен до подписки на room channel, с проверкой watermark после async чтений.
- Inclusive prefix до структурного watermark сначала absorbHistorical, с оригинальным состоянием undone/done, затем replay tail. Нельзя просто добавить colour3 как done и вызвать redo: он ожидает undone.
- restoreHistoricalOperations пересобирает только существующие непокрытые слои. Исторические отсутствующие source слои не revoke и используются рекурсивным rebuild merge/copy результата.
- Между room_state и HTTP index покрытие может измениться. Для слоёв без покрытия до index.seq клиент получает scoped history с fixed beforeSeq=index.seq+1 через существующий REST operations; optional layerIds не меняет формат операций/снимков. Безопасные полностью покрытые слои не загружаются. Отказ сети остаётся failed restore, а не пустой успех.

## CPU evidence и пределы

160 целевых тестов (7 файлов): реальный Engine+restoreRoomState пиксельный undo5/redo6 регрессионный контроль; соседний безопасный снимок неизменен; исторический merge/copy результата с отсутствующим source; cold target lookup; older snapshot; missing target fail-closed; HTTP scoped query/source closure; inclusive index-race prefix и normal fully-covered no-fetch. Функции настоящие, Prisma и transport изолированы тестовыми doubles. Это не аппаратный GPU proof.

Аппаратное повторение исходной комнаты, reconnect/late join и реальный StoredSnapshot для кандидата ещё НЕ выполнено. Полная структурная undo-семантика (undo старого delete/merge с восстановлением UI base) этими тестами не доказана: planner source closure не означает её автоматическое исправление. Сценарий original Bundo pixel-noop остаётся отдельным контролем; altered early-Bundo sequence совпал с fresh replay, но это иной журнал.

Для review: source/schema изменяются узко, shader/operators/packed dabs не меняются; source rebase/phase flags root сохраняются при cherry-pick. Новый протокол хранения, вечное удержание всей истории и blanket full replay не вводятся.

## Follow-up: prefix reconstruction завершён до tail source reads

Review обнаружил порядок, который одного absorbHistorical недостаточно закрыть: при suspendDisplay prefix source S откладывается, а tail merge/copy сразу читает live S. Теперь restoreHistoricalOperations запускает существующий rebuild (включая существующую нарезку GPU), асинхронно ждёт окончания только затронутых jobs и проверяет destroy/context loss. После него хвост видит реконструированный источник. CPU regression suspendDisplay→prefix S→tail merge/copy проверяет nonempty S и точные пиксели R; первоначальная deferred реализация это условие не выполняет. No-snapshot fast loader также повторяет чтение при изменившемся watermark. 49 тестов трёх затронутых файлов проходят; server/web types проходят. Hardware gate должен отдельно наблюдать отсутствие prefix rebuild jobs при первом tail redo/copy.

Подготовлен controller temp/hardware/snapshot-closure.mjs (ignored artifact, node --check PASS): тот же P8TL9XaE, оригинальный persisted blob layer-1/5 HTTP200, проверка реальных undo5/redo6 target IDs, оба обычных restore, чистый full authoritative journal oracle, обычный reconnect и новый auth late join; one Chrome/two contexts максимум,180s finally. Подавляется только новая публикация снимков из собственных QA pages, чтобы не замаскировать прежний снимок новой копией. Исходники/операции/пиксели не переписываются. Контроллер пока не запускался.

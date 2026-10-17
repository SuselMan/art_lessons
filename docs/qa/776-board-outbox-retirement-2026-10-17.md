# #776: старый Outbox после смены доски

Подтверждены два отдельных await-gap на реальном Outbox и createOutboxVerdicts:

- Сервер уже вернул ACK/target_gone, IndexedDB.delete ещё pending. После dispose
  завершение delete вызывало confirm/discard/recovery старой доски через новые refs.
- resetForBoard уже сменил socketBoardRef, но passive React effect ещё не сделал
  dispose. Ответ send проходил проверку disposed и удалял durable payload.

Исправление: окончательный verdict исполняется синхронно после проверки владения,
до await delete. Уведомление pending-count идёт после verdict. После send и retry
persist повторно проверяется существующий canSend captured-board gate. При
временном disconnect/смене доски запись остаётся в своей очереди; повторная
отправка после join сохраняет ID и пользуется обычным серверным dedup.
Нового persisted-протокола нет. Во время delete UI callbacks больше не ожидаются.

Проверки: 53 теста Outbox/verdict/retirement PASS, включая deferred-delete ACK и
recovery, dispose при финальном retry persist, синхронную смену из pending-count,
board mismatch до dispose и temporary gate→rejoin→same-ID resend. Web typecheck
прошёл перед добавлением двух булевых ownership-проверок; oxlint PASS.
Настоящий IndexedDB timing/GPU не измерялся: async boundary контролируется тестом.

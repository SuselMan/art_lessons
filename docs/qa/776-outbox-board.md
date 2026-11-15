# #776: ответ старого Outbox и новая доска

База: `2fbab5ab50fe0904266efc99b31f2365d06976cf`.

Два async-gap позволяли старой очереди менять текущие refs: storage.delete после
окончательного ответа и retry persist перед stalled/retry callbacks. Ещё одно
окно — socketBoardRef уже сменился, passive effect ещё не вызвал dispose.

Окончательный ответ обрабатывается синхронно на своей доске до ожидания удаления
в IndexedDB. Pending-count уведомляется после verdict. После send и retry persist
проверяются disposed и существующий canSend gate, привязанный к boardId. Ответ,
пришедший после смены доски/отсоединения, оставляет запись под старым roomId:
при следующем разрешённом resend сохраняется исходный ID для серверного dedup.
Обычное окончательное завершение продолжает удалять durable запись.

## Свежая проверка

- На исходном коде все **6/6** новых unit-сценариев FAIL. После изменения все
  Outbox/verdict/retirement **53/53** PASS: задержанные delete и retry persist,
  смена из pending-count, mismatch до dispose, временный gate и повторный ACK.
  Использован обычный Pencil, экспериментальная акварель не нужна.
- Все Room tests: **669/669, 67 файлов, 78.16s**, exit0.
- Два браузерных baseline FAIL80.8s: после реального IndexedDB delete и UI
  переключения callbacks получили ID новой доски и новый engine (originalEngine
  false), отдельно ACK/confirm/snapshot и target_gone/discard/recover.
- После изменения Chromium/SwiftShader, отдельные Postgres/API/frontend offset776:
  **2 PASS58.1s**. Оба callback-набора относятся к старому boardId и engine,
  после release запись в настоящем IndexedDB удалена.
- Транспортный SendResult и barrier удаления управляются fixture; Outbox,
  createOutboxVerdicts, IndexedDB, живые engine и переключение UI настоящие.
  Это проверка принадлежности callbacks, не полный lost-work recovery pipeline.
- QA также воспроизвёл независимый стартовый thumbnail FK500: #832. Финальный
  тест удерживает этот HTTP запрос до появления настоящей room row, затем
  пропускает реальный запрос на сервер. Ответы не подменяются. В первом after-run
  recovery прошёл, ACK остановился на данном независимом console500.
- Штатные thumbnail429/до-create403 и специально вызванный console target_gone
  от QA-operation аннотируются; остальные console/JS errors запрещены.
- Полный typecheck (workspaces/e2e/scripts), затем отдельные web+e2e после возврата
  runtime из baseline; lint:fix, map:check/map:rules: exit0, прежние warnings.

Остаётся отдельная #777: потеря отложенного recovery batch при смене доски до его
flush. Данный фикс изолирует callback, но не вводит durable recovery handoff.
Этот случай не объявляется исправленным.

Собственные browser/context и API/frontend закрыты; три одноразовых Postgres
контейнера и anonymous volumes удалены. Disposable trace/video удалены штатным
qa-cleanup finish с marker/nonce и проверкой отсутствия процессов. Собственные
dependency views/generated Prisma/shared/dist и ссылка на paper удалены.
Временных работающих ресурсов не осталось. Worktree и компактные логи сохранены
в игнорируемом temp/776-outbox-board/.

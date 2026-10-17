# #780: присутствие нескольких подключений одного участника

Дата: 17.10.2026. База: `4c6beeca`. Первый фикс: `3a36c6b9`.
Проверки запускаются в отдельной рабочей копии `780-same-identity-presence`;
production, backend 4558 и аппаратные проверки координатора не затрагивались.

## Подтверждённые дефекты

- Реальные rooms/gate: owner-old → owner-new → freeze → new-disconnect удалял
  ещё подключённого владельца. Baseline: 1 regression FAIL, 141 existing PASS.
- Реальный Socket.IO с отдельным observer: при отключении одного из двух сокетов
  не отменялся его live-хвост. Baseline: 2 regression FAIL, 9 existing PASS.
- После первого фикса переход сокета на другую доску/урок без disconnect оставлял
  его хвост на прежней доске; переход последнего seat в другой урок не сообщал
  старому уроку о восстановлении доски оставшегося сокета.
  Follow-up baseline на `3a36c6b9`: 3 regression FAIL, 14 existing PASS.

## Исправление и проверки

Один logical participant присутствует до ухода последнего сокета. Ordered roster
восстанавливает доску последнего живого подключения, сохраняя роль, цвет,
заморозку и поднятую руку. Старому уроку отправляется `peer_board_changed`;
`peer_left` отправляется только при фактическом уходе пользователя.
Live-хвосты учитываются отдельно на сокет (128 ID длиной до 256 символов);
отключение или успешный переход отменяет только хвосты этого сокета на исходных
досках. Отказанный переход их не завершает. Обычный end и окончательный отказ
операции освобождают учёт; duplicate не вызывает отмену.

Проверено обе порядка отключения, разные доски, live двух одинаковых identity,
owner-операция после latest-close в frozen room, сохранение hand/frozen/color,
удаление пустого урока и досок, roster при переходе между уроками, ограничение
active IDs и отсутствие учёта refused live packets.

- Первый фикс: 38 server suites / 685 tests PASS; последний добавленный owner-wire
  regression отдельно: 14 Socket.IO tests PASS.
- Follow-up: 16 rooms suites / 374 tests PASS; затем добавлена проверка kick:
  18 Socket.IO tests PASS. Server `tsc --noEmit` и `git diff --check` PASS.
- Kick снимает все сокеты пользователя в уроке и даёт observer ровно один
  `peer_left`; оба сокета остаются подключены. Существующий клиентский handler
  вызывает `endPeerLiveStroke(userId)` и resync для orphaned ink. Дополнительный
  cancel в kick не требуется.

Socket.IO настоящий, HTTP на случайном порту с teardown в afterEach; Postgres —
mock row store, identity — test cookie. GPU/browser в этом прогоне не использовались.
Зависимости заимствованы scoped links при совпадающем lockfile; shared alias и types
брались из текущего worktree. Собственные links/generated shared dist/tsbuildinfo
и disposable QA config/log copies удалены. Постоянных сервисов не создавалось.
Компактные исходные логи сохранены отдельно в ignored `temp/qa780-evidence`.

# #786: поздняя эвакуация удаляемой доски

Дата: 17.10.2026. База frozen integration `6cd49722`; отдельный worktree
`server-evacuation-audit`, ветка `agents/786-evacuation-liveness`.
Issue: https://github.com/SuselMan/art_lessons/issues/786.

## Подтверждение

Настоящий Socket.IO, fixture Postgres с управляемым promise в
prepareSnapshotReplay. Вызывается exported evacuateBoard — тот же entry point,
которым DELETE board route пересаживает участников перед удалением доски.
Baseline: 2 FAIL / 41 skipped, только два новых regression tests.

1. Ученик на B, evacuation ждёт snapshot main. Серверный disconnect ученика
   завершён, query released. Baseline заново создаёт ghost member на main.
2. Ученик на B, evacuation ждёт snapshot main. Ученик успешно входит на C;
   query released. Baseline возвращает его на main; следующий paper_dry получает
   успешный ACK и записывается в main вместо C.

## Исправление и контрольные случаи

После await берётся актуальный socket из local registry этого процесса;
connected, текущие board и lesson проверяются повторно до joinRoom, каналов,
room_state и board-changed события. Имя участника также читается после await.
Старое соединение/уже другая доска пропускаются. Публичный wire, роли, права и
поколения create/join не менялись; сервер сейчас один, cross-process adapter нет.

- Disconnect: participant отсутствует после позднего завершения.
- Успешный C join: поздняя evacuation не меняет boardId; принятый paper_dry
  находится в tail C и отсутствует в main.
- ABA B→C→B: участник сейчас снова на реально удаляемой B, поэтому корректно
  эвакуируется в main; обновлённое имя сохраняется.
- Независимый C join ещё ждёт query: evacuation B→main завершается, потом C join
  завершается в C; последующий paper_dry остаётся в C.

Проверки: четыре новых Socket.IO случая PASS. Три целевых server suites
(socketHandlers, boardRoutes, operationGate): 72/72 tests PASS. Server tsc --noEmit,
oxlint --fix изменённых файлов и git diff --check PASS. Широкие suites не запускались.

## Короткий аудит других путей

Operation handler не сохраняет async participant handles: синхронно читает
актуальные socket.data.roomId/userId и текущие participant/frozen sets урока.
Dry проходит тот же gate. Client outbox привязан к board, проверяет canSend перед
sync emit и при ACK; старые очереди dispose. Нового доказанного обхода frozen/role
на этих путях не найдено; авторизацию и протокол не расширяли.

GPU/browser, backend4558 и integration source не менялись. Test HTTP server на
случайном порту и clients закрываются в afterEach. Совместимый lockfile проверен;
scoped dependency links и generated shared types после QA убраны. Compact logs
сохранены отдельно в ignored temp/qa786-evidence; disposable QA config удалён,
source worktree сохранён. Постоянных сервисов не создавалось.

# #783: поздний вход не отменяет новое намерение

База: `49c3760758b2581dd89da7e3d527d206081f2293`, ветка
`agents/783-release-generation` (историческая agents/783-join-generation сохранена).

create_room/join_room делят поколение сокета. После load/access/replay await
проверяются connected, поколение и DELETE cancellation до seating/broadcast.
Pending handlers одной комнаты считают владельцев cold residency; освобождение
идёт в finally после последнего ожидающего handler. Ответ старому запросу
использует существующий transient server_busy, shared/wire контракт не менялся.

Отдельный подтверждённый случай: cancelled cold load возвращал false, и create
считал удалённый урок новым. retainRoomLoadIntent сохраняет токен отмены на весь
admission, включая промежуток после завершения cache load и до seating.
DELETE отменяет и запросы resident child boards. Токены убираются в finally;
постоянного списка удалённых ID нет.

Клиентский switchBoard проверяет своё поколение до emit и в ACK. Строка boardId
сама по себе не различает первый и третий B при B→C→B. Устаревший отказ не меняет
wanted/socket board, ready, hasJoined или notices; актуальный отказ обрабатывается.

## Свежая проверка

- Baseline: **12FAIL / 51** actual Socket.io + joinFlow tests. Ghost после
  disconnect на стадиях load/access/replay, stale join/create и клиентский ABA.
- Дополнительная DELETE/create регрессия FAIL на первоначальном generation fix:
  удалённый урок пересоздавался. После удержания cancellation все профильные
  server socket/loader и joinFlow **62/62 PASS**.
- Вся область server rooms/roomRoutes + web Room: **1257/1257, 91 файл, 80.15s**.
- Реальные browser/UI/WebSocket baseline на HEAD: B→C→B отправляет **два**
  одинаковых join_room(B), FAIL36.6s. После изменения **PASS43.1s**: ровно один
  запрос на исходном транспорте, конечная B готова, реальный Pencil stroke
  подтверждён и найден через HTTP history B; history C не содержит strokes.
  Chromium/SwiftShader, собственные Postgres/API/frontend offset783.
- В burst используются настоящие React handlers в одном JS task; WebSocket
  frames только наблюдаются, не подменяются. Canvas stroke введён Playwright CDP.
  Новый транспорт при штатном remount отделён от исходного source wire.
- Первичные прогоны с неверным CSS implicit-role selector и перекрывающей начало
  штриха панелью не использованы как доказательство регрессии. Исправленный
  одинаковый сценарий сравнен на HEAD и изменённом коде; SHA256 трёх runtime
  файлов и исходный HEAD записаны в source JSON рядом с логами.
- Начальные thumbnail403 и штатный429 аннотированы; остальные console/JS errors
  запрещены. Полный typecheck (workspaces/e2e/scripts), повторный e2e после
  уточнения fixture, lint:fix, map:check/map:rules: exit0, прежние warnings.

Отдельная #784 остаётся: уход последнего уже сидящего участника может выселить
cache из-под ожидающего newcomer. Здесь защищается cleanup завершающихся
admission handlers; универсального residency lease ещё нет.

Собственные browser/context/API/frontend закрыты. Пять одноразовых Postgres
контейнеров и anonymous volumes удалены; disposable trace/video удалены
qa-cleanup finish с marker/nonce/проверкой отсутствия процессов. Dependency views,
собственный generated Prisma/shared/dist и ссылка на paper удалены. Временных
работающих ресурсов не осталось. Worktree, компактные логи и source hashes
сохранены в ignored temp/783-join-generation/.

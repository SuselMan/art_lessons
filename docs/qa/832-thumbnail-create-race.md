# #832: thumbnail ждёт создания своей комнаты

База: `1ce085197165b05a4c734961eb02ffe1d12b5951`.

create_room синхронно публикует live participant, а INSERT комнаты исполняется
в существующей очереди persistRoomCreate. POST thumbnail мог пройти live
авторизацию и попытаться вставить FK child раньше parent row, получая500/P2003.

После прежних проверок доступа, формата/размера и rate limit маршрут ожидает
flushRoomWrites(roomId) перед upsert. Горячий путь рисования не меняется;
неавторизованные и некорректные запросы не ждут очередь создания.

## Проверка

- Unit с настоящим enqueueWrite и удержанным create: до исправления FAIL,
  upsert вызван раньше parent; после — все thumbnail route tests24/24 PASS.
  При контрфактической проверке тест ожидает прохождения авторизации до проверки
  порядка; один setImmediate не гарантировал достижения обработчика.
- Настоящий Chromium/SwiftShader + отдельный Postgres/API/frontend offset832.
  Отдельная psql transaction держит SHARE table lock на Room, блокируя только
  INSERT в одноразовой QA БД. Создание в UI уже подтверждено live; ручной HTTP
  thumbnail POST с реальным cookie конкурирует с queued INSERT.
- Старый код: FAIL34.7s, thumbnail POST500/P2003 пока parent не существует.
- После: **PASS39.7s**, POST остаётся pending при lock, после COMMIT отвечает200
  (наблюдаемое время POST1063.8ms), GET возвращает ровно те же байты PNG.
  Psql lock/session закрываются в finally, PID/команда/owner/TTL записаны в лог.
- Автоматические thumbnail requests удержаны до завершения ручной проверки,
  затем передаются настоящему серверу. Штатный throttle429 и GET access404,
  пока test намеренно блокирует parent row, аннотируются. Остальные console/JS
  errors запрещены. Ни ответы сервера, ни база не подменяются.

Все server rooms+roomRoutes: **551/551, 24 файла, 26.43s**, exit0. Полный
typecheck (workspaces/e2e/scripts), lint:fix, map:check/map:rules: exit0, прежние
предупреждения. Изменений схемы/протокола нет.

Собственные psql lock/session и browser/context закрыты, API/frontend остановлены.
Оба одноразовых Postgres-контейнера и anonymous volumes удалены; disposable
trace/video удалены qa-cleanup с проверкой marker/nonce/отсутствия процессов.
Dependency views/generated Prisma/shared/dist и ссылка на paper удалены.
Временных работающих ресурсов не осталось. Worktree и компактные логи сохранены
в игнорируемом temp/832-thumbnail-create-race/.

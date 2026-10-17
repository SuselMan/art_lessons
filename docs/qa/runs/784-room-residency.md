# #784: pending join удерживает доску и урок до завершения запроса

Дата: 17.10.2026. База `00c15f18` (#783). Отдельный worktree
`784-room-residency`, ветка `agents/784-room-residency`.
Issue: https://github.com/SuselMan/art_lessons/issues/784.

## Baseline и принцип

На исходной базе реальные Socket.IO tests: 4 FAIL — target main/child × последний
уходящий owner/member. Newcomer ждёт snapshot query, последний старый участник
отключается, после flush старый record evicted; release query даёт ложный not_found.

Присутствие людей и временная потребность pending запроса в resident records —
разные факты. isIdle и публичные контракты не менялись. Registry хранит refcounts
residency lease, rooms проверяет их при eviction, loader дополняет lease родительским
уроком сразу после получения lessonId, до await загрузки родителя/данных доски.
Для уже resident child родитель удерживается при создании lease синхронно.

Handler-only pendingJoins map #783 заменён общей lease. finally освобождает refcounts
и пытается удалить idle records. Другой pending request сохраняет свой refcount;
успешный join сохраняет record через обычное presence. Никакие durable данные
не удаляются. Memory admission evictIdleRooms проходит тот же eviction guard.

## Проверки

- Actual Socket.IO main/child × уходящий last owner/member: после query release
  newcomer входит успешно, role и boardId правильные, parent resident.
- Main/child: два pending newcomers, старый owner уходит, один newcomer disconnected;
  отменённый finally и forced idle cleanup не мешают второму. После его успешного
  входа и ухода и parent, и child действительно evicted.
- Cold child (ещё не resident): loader узнал parent и ждёт чтения контента; последний
  owner уходит. Parent сохраняется. Оба окончания проверены: success + последующий
  disconnect и cancellation во время load; после final release записи удаляются.
- Direct rooms API: pin до отложенного eviction и pin после назначения pending-write
  callback; callback повторно проверяет pin после writes. Также release до writes
  settle — records уходят после завершения writes. Forced eviction не обходит lease.
- Две lease одной child: release первой не удаляет child/parent; release последней
  удаляет idle записи. Повтор release idempotent, refcounts не уходят ниже нуля.
- Финальный полный server: 38 suites / 721 tests PASS; server tsc --noEmit,
  oxlint --fix и git diff --check PASS.
- Первичный полный rooms прогон: 16 suites / 404 tests PASS; два последних cold-child
  loader cases отдельно PASS. Server typecheck и oxlint --fix изменённых файлов PASS.

CPU-only: настоящий Socket.IO на случайных test HTTP ports, managed promise в PG
mock, teardown clients/server в afterEach. GPU, backend4558, интеграционные исходники
и production не менялись. Диагностика сохранена компактно в temp/qa784-evidence.
Scoped dependency links и generated shared dist/types удаляются после проверок;
source worktree сохраняется, постоянных сервисов не создавалось.

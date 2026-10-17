# Источники и сохранность

## base

Каталог основан на origin/main `f52635e3` (fetch17.10.2026).
Локальный основной checkout `bd2cd523` отличается от origin/main; его не переключали.
56 E2E specs этого baseline перечислены в [карте](automation.md).
Старые QA-001…024 сохранены в [неизменённом исходнике](../sources/collaboration-before-793.md),
результат — [2026-10-02](../runs/2026-10-02.md). Дата результата не равна дате текущей версии.

## Общая история проекта

[675 GitHub issues](history-issues.json) — все состояния, не только последняя сотня.
[Аудит 217 дефектов](history.md) связывает историю с кейсами; [машинные решения](history-audit.json)
отделяют прямую связь от учебных/инженерных/feature записей. Labels и закрытие не являются PASS.
[331unit-файл](unit.md) зафиксирован SHA содержимого, исходные assertions доступны в коде;
[152browser определения](browser-cases.json) соответствуют 180 вариантам настоящего Playwright discovery.
Названия и SHA файлов — сохранённые факты, а не обещание их исполнения на текущей версии.

## night

Источник NIGHT зафиксирован на `8c4c5d1b93c775107bdc0b17ba0e5afdd7ae0298`,
ветка `agents/728-watercolor-room-integration`, существующий worktree
`~/projects/pencil-agents/728-watercolor-room-integration`. Это локальные неопубликованные
коммиты. Ссылки GitHub blob на них пока не обещают доступность.
Финальный frontend проверялся как `43f87295`, backend `ac892525`; промежуточные прогоны имеют
свои SHA. Docs HEAD не подставлять вместо runtime SHA.

[Читаемый итог](../sources/night-2026-10-17/745-watercolor-night-readable-2026-10-17.md),
[вторая волна](../sources/night-2026-10-17/745-night-second-wave-2026-10-17.md),
[первая волна](../sources/night-2026-10-17/745-watercolor-night-2026-10-17.md)
скопированы побайтно. Компактные избранные доказательства тоже сохранены;
[source manifest](sources.json) содержит исходный путь, копию и SHA256, а также инвентарь
harness/unit/E2E pinned-ветки. Большие результаты не переносились, продуктовый код не копировался.

Чтение любого source-only теста или harness из корня репозитория без смены checkout:

```sh
git show 8c4c5d1b93c775107bdc0b17ba0e5afdd7ae0298:docs/qa/harness/728-night/samsung-wallclock-soak.cjs
git show 8c4c5d1b93c775107bdc0b17ba0e5afdd7ae0298:apps/web/src/engine/index.m70LegacyOwnership.test.ts
```

Для исполнения использовать указанный NIGHT worktree и проверить текущий HEAD/status.
Если он ушёл вперёд, читать pinned SHA через git show; не сбрасывать чужие изменения.
В новой копии без этих локальных git objects восстановление NIGHT и исходная автоматизация
BLOCKED до получения разрешённого bundle/публикации владельцем. Сохранённые определения и
компактные доказательства читаются независимо от наличия NIGHT checkout.

Исторические отчёты не исправлялись под новые статусы, пути, число участников или правила.
Уточнения/опровержения живут в индексе [результатов](results.md), а не заменяют старый файл.

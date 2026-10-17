# Как выполнить сценарий

## Подготовка

Выбрать suite и конкретный SHA кандидата, а не считать каталог доказательством прохождения.
Команды ниже выполняются из корня выбранного worktree. Начать с `git status --short`,
`git rev-parse HEAD`, `df -h /`, `free -h`. Проверить lockfile и имеющиеся зависимости;
не создавать новый node_modules ради чтения каталога или `--list`.
Для настоящего приложения нужны зависимости, собранный shared, Prisma client и baked paper.
Сверить команды с [E2E README](../../../e2e/README.md) и
[Playwright config](../../../playwright.config.ts). Не переносить env рабочего сервера в тестовый.

Одна отдельная тестовая БД и backend; максимум три frontend этой задачи. До старта проверить
занятость выбранных портов и владельца. Стандарт E2E: web5491, API4491, PG55491;
`E2E_PORT_OFFSET` сдвигает все три и имя контейнера. Занятый порт — выбрать свободный offset,
а не останавливать чужой процесс. Не использовать production или комнаты пользователей.
`E2E_KEEP_DB` по умолчанию не включать. Записать PID/команду/владельца/срок своих процессов,
расходные каталоги зарегистрировать через `~/linux-setup/scripts/services/qa-cleanup.py`
по `~/linux-setup/docs/qa-resource-lifecycle.md`.

Для hardware перед подключением прочитать home-device-access и references/access.md,
затем grafetto-device-testing; для UI/undo/replay — grafetto-verify в `~/.codex/skills/`.
Samsung начинать с cached endpoint/mDNS и `home-devices status`. iPad должен быть активен
с открытой Safari: без этого device lane BLOCKED. Никаких изменений роутера/VOROBRO.

## e2e

Сначала просмотреть выбранные тесты без старта серверов:

```sh
python3 scripts/qa/check_catalog.py --suite smoke
npx playwright test e2e/specs/draw.spec.ts e2e/specs/undo.spec.ts e2e/specs/peer.spec.ts --list
npx playwright test e2e/specs/draw.spec.ts e2e/specs/undo.spec.ts e2e/specs/peer.spec.ts --project=chromium
```

Вторая характерная выборка:

```sh
npx playwright test e2e/specs/contextLoss.spec.ts e2e/specs/reconnect.spec.ts --list
```

Подробные кейсы запускаются также по `file:line`, например
`npx playwright test e2e/specs/layerFilter.spec.ts:116 --project=chromium --list`
выбирает пять фильтров одного сценария; это один кейс с пятью вариантами.

Большой набор: `python3 scripts/qa/check_catalog.py --suite full` печатает полный состав,
после подготовки `npm run test:e2e` исполняет **все текущие** specs (также несопоставленные
новые, если каталог забыли обновить; checker это запрещает). Ручные gates suite выполняются
дополнительно, автоматически Playwright их не запускает. `--list` ничего не доказывает о продукте.

При headless VPS без GPU явно задать `E2E_GL=swiftshader`: это программная растеризация,
не device PASS. Записать renderer фактического WebGL context, браузер/ОС и build.
Playwright desktop Chromium не становится iPad/Safari от viewport или user agent.
CI сейчас запускает single-browser; @two-browsers advisory по `e2e-full`/ручному workflow.
Перед запуском сверить [CI](../../../.github/workflows/ci.yml); эти условия могут измениться.

## Специальные и unit проверки

Для unit из текущего checkout: `npx vitest run <путь-к-test.ts> --maxWorkers=1`.
MockGL доказывает вызовы/инварианты, а не пиксели.
Для server unit сначала прочитать выбранный test: часть мокает Prisma, часть специально
проверяет отказ записи без схемы. Даже такой suite может выглядеть зависшим без доступного
PostgreSQL из-за connect timeout. Указывать `DATABASE_URL` явно только на собственный
одноразовый unit PG, не на dev/production или чужой E2E PG; не подхватывать `.env` вслепую.
Для no-schema tests база намеренно без migration; для настоящих integration fixtures нужна
их схема. У нового контейнера `--rm`, уникальное имя/порт и гарантированный finally cleanup.
Не запускать второй тяжёлый стенд параллельно существующему ради unit-проверки.
Пример команды после явной подготовки своей unit БД:

```sh
: "${QA_UNIT_DATABASE_URL:?Нужна отдельная одноразовая unit БД}"
DATABASE_URL="$QA_UNIT_DATABASE_URL" npx vitest run apps/server/src/rooms/rooms.test.ts --maxWorkers=1
```

В кодовых/auth mocks без обращения к БД реальная доставка письма или Prisma persistence
этим не проверяются. Ни один unit-support не переводит ручной acceptance в PASS. Найденный regression сначала должен упасть
на дофиксном коде; expected FAIL открытого дефекта остаётся отдельным FAIL в отчёте.
Unit-файл из NIGHT запускать только из checkout NIGHT с его совместимыми зависимостями.

NIGHT harness — сохранённые экспериментальные программы, **не готовый универсальный runner**.
Сначала выполнить чтение из [реестра источников](sources.md#night), проверить `process.env`,
пути `require`, служебные endpoints, условия seed и finally. Некоторые файлы имеют исторические
локальные defaults; не подставлять их вслепую и не запускать без изоляции.
Типичная группа переменных (проверить точный набор в выбранном файле):
`QA_CDP`, `QA_ENTRY_URL`, `QA_BASE_URL`, `QA_BACKEND_URL`, `QA_ROOM`,
`QA_DISPOSABLE_ROOM`, `QA_HOST_STATE`, `QA_OUTPUT`, `QA_SOURCE`.
QA_ROOM должен совпадать с явно созданной disposable комнатой; private host-state остаётся вне Git.
После подготовки: `node docs/qa/harness/728-night/<имя>.cjs` из NIGHT checkout.
Недостающий seed/auth/device означает BLOCKED, а не разрешение взять чужую комнату.
Пока адаптер не подготовлен, каждый кейс можно исполнить вручную по его шагам;
отсутствие доступного аппаратного контроля записать BLOCKED.

Parity scripts текущего дерева из [индекса](automation.md) принимают
`DEVBRIDGE_PORT`, `DEVBRIDGE_URL` и `laptop=<id> surface=<id> ipad=<id>`;
передать только реальные активные bridge IDs. URL и IDs в Git не сохранять.

## Что сравнивать

Сначала записать полный принятый журнал: ID, seq, payload hash, author, pending/rejected;
сверить структуру/порядок слоёв. Потом снять actual physical и готовый canonical материал
**до** независимого full-history oracle. Проверить, не вызвало ли чтение дополнительный расчёт:
это часть результата. Только после capture делать export/replay/bake. Декоративная анимация,
бумага, курсоры и canonical target — разные проверки, не один screenshot hash.

Для M70 QA-042 требуется byte-exact между GPU. Исторические noise/marker gates QA-022/024
с порогом >24 сохраняют собственные fixture, не ослабляют M70. Локальная точность replay
не доказывает cross-GPU. При несовпадении сохранить компактные raw ROI/вход, seed,
параметры, SHA и первый отличающийся этап. Не менять допуск, чтобы получить PASS.

Время измерять до видимого результата, active gesture и tail отдельно. Сетевой автор,
browser context, renderer и физическое перо считать раздельно. Реальные 30 минут и recorded
span30 мин — разные lanes. Dry посередине разрывает непрерывную мокрую эпоху.

## Завершение

Заполнить [результат](result-template.md), обновить индекс последнего результата только для
соответствующих SHA/device/mode. Закрыть свои context/targets, сокеты, комнаты и auth;
остановить только записанные свои временные PID, удалить disposable сборки/trace/video
после сохранения компактных доказательств и убрать карточку своего временного сервиса.
Не удалять исходники, worktrees и пользовательские данные. В отчёте назвать оставшиеся ресурсы
или подтвердить уборку. Исторические утверждения cleanup в старых отчётах не являются текущей
проверкой чужих процессов.

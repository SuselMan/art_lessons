# Регрессии из истории проекта и контрактов

195 самостоятельных сценариев и 2 сохранённых alias дополняют браузерные. Источники: задачи/исправления и существующие unit-контракты; счётчик тестов не объявляется числом пользовательских кейсов. Здесь есть и исторически исправленные, и открытые дефекты. Закрытая issue не означает PASS нового кандидата.

[Общие условия запуска](execution.md) обязательны. Изолированная disposable комната и БД; учитель/ученик — разные identity, если кейс не требует sibling-вкладок. Перед ручной проверкой воспроизвести начальное состояние, затем шаги и измеримое ожидание. Ссылки на unit ниже означают **частичную поддержку инварианта**, а не полную UI/GPU/письмовую/эксплуатационную автоматизацию; такой acceptance по умолчанию ручной. Неподдержанная семантика/недоступный fixture — BLOCKED. Текущий результат каждого кейса NOT RUN.

## Вход и сессии

<a id="qa-401"></a>

## QA-401 — Вход гостя и устаревшая cookie

**Начало и участники:** Новый браузер; отдельно подписанная cookie удалённого пользователя.

**Действия:** Открыть создание комнаты и socket с новой/устаревшей cookie.

**Ожидание:** Создана действительная guest identity; отсутствующий userId не уходит в socket, известный аккаунт сохранён.

**Автоматизация:** частичные unit-контракты [identity.test.ts](../../../apps/server/src/auth/identity.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#41 (CLOSED, закрыта 2026-07-05)](https://github.com/SuselMan/art_lessons/issues/41), [#695 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/695). Статус нового запуска: NOT RUN.

<a id="qa-402"></a>

## QA-402 — Запрос кода email

**Начало и участники:** Гость с тестовым почтовым провайдером.

**Действия:** Запросить код для нового и существующего email.

**Ожидание:** Ответ не раскрывает наличие аккаунта; письмо отправлено, есть confirmation phrase и nonce-cookie.

**Автоматизация:** частичные unit-контракты [authRoutes.test.ts](../../../apps/server/src/auth/authRoutes.test.ts), [loginCodes.test.ts](../../../apps/server/src/auth/loginCodes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#316 (CLOSED, закрыта 2026-07-29)](https://github.com/SuselMan/art_lessons/issues/316). Статус нового запуска: NOT RUN.

<a id="qa-403"></a>

## QA-403 — Неверный email и отказ провайдера

**Начало и участники:** Тестовый mail transport с управляемым отказом.

**Действия:** Ввести некорректный email, затем валидный при отказе отправки.

**Ожидание:** Ошибки различимы и показаны; успешный вход не объявлен, секретный код не выдан.

**Автоматизация:** частичные unit-контракты [authRoutes.test.ts](../../../apps/server/src/auth/authRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#316 (CLOSED, закрыта 2026-07-29)](https://github.com/SuselMan/art_lessons/issues/316). Статус нового запуска: NOT RUN.

<a id="qa-404"></a>

## QA-404 — Код только своему браузеру

**Начало и участники:** Код выдан браузеру A, второй браузер B без nonce A.

**Действия:** Правильный код отправить из B, без nonce, затем из A.

**Ожидание:** Чужой browser и отсутствие nonce отказаны с учётом попытки; A может войти согласно состоянию кода.

**Автоматизация:** частичные unit-контракты [loginCodes.test.ts](../../../apps/server/src/auth/loginCodes.test.ts), [authRoutes.test.ts](../../../apps/server/src/auth/authRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#316 (CLOSED, закрыта 2026-07-29)](https://github.com/SuselMan/art_lessons/issues/316). Статус нового запуска: NOT RUN.

<a id="qa-405"></a>

## QA-405 — Одноразовость и срок кода

**Начало и участники:** Выдан свежий шестизначный код в тестовой БД.

**Действия:** Ввести верный код; повторить использованный. Отдельно истечь 10 мин и ввести просроченный.

**Ожидание:** Один вход на код; повтор и expiry отказаны явно; nonce потрачен вместе с кодом.

**Автоматизация:** частичные unit-контракты [loginCodes.test.ts](../../../apps/server/src/auth/loginCodes.test.ts), [authRoutes.test.ts](../../../apps/server/src/auth/authRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#316 (CLOSED, закрыта 2026-07-29)](https://github.com/SuselMan/art_lessons/issues/316). Статус нового запуска: NOT RUN.

<a id="qa-406"></a>

## QA-406 — Неверные попытки кода

**Начало и участники:** Выдан код для одного адреса.

**Действия:** Вводить неверные значения до установленного предела; затем правильное.

**Ожидание:** Попытки учтены, код сожжён после предела; последующие запросы не обходят блокировку.

**Автоматизация:** частичные unit-контракты [loginCodes.test.ts](../../../apps/server/src/auth/loginCodes.test.ts), [authRoutes.test.ts](../../../apps/server/src/auth/authRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#237 (CLOSED, закрыта 2026-07-28)](https://github.com/SuselMan/art_lessons/issues/237), [#316 (CLOSED, закрыта 2026-07-29)](https://github.com/SuselMan/art_lessons/issues/316). Статус нового запуска: NOT RUN.

<a id="qa-407"></a>

## QA-407 — Cooldown повторного письма

**Начало и участники:** Есть только что отправленный код.

**Действия:** Запросить новый сразу, после cooldown и после использования старого.

**Ожидание:** Cooldown возвращён числом секунд; новый код гасит прежние; использованный не заставляет ждать заново.

**Автоматизация:** частичные unit-контракты [loginCodes.test.ts](../../../apps/server/src/auth/loginCodes.test.ts), [authRoutes.test.ts](../../../apps/server/src/auth/authRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#316 (CLOSED, закрыта 2026-07-29)](https://github.com/SuselMan/art_lessons/issues/316). Статус нового запуска: NOT RUN.

<a id="qa-408"></a>

## QA-408 — Rate limit почты и IP

**Начало и участники:** Тестовые адреса/IP; изолированное состояние лимитов.

**Действия:** Менять IP при рассылке одному mailbox; одним IP обращаться к разным адресам; превысить budget.

**Ожидание:** Лимиты mailbox и IP не обходятся и не блокируют ошибочно весь сервер; отказ имеет правильный статус.

**Автоматизация:** частичные unit-контракты [authRoutes.test.ts](../../../apps/server/src/auth/authRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#237 (CLOSED, закрыта 2026-07-28)](https://github.com/SuselMan/art_lessons/issues/237). Статус нового запуска: NOT RUN.

<a id="qa-409"></a>

## QA-409 — Гость становится аккаунтом

**Начало и участники:** У гостя уже есть комнаты, email ещё не зарегистрирован.

**Действия:** Войти кодом нового email и открыть прежние комнаты.

**Ожидание:** Регистрация заполняет ту же guest row; проекты не потеряны.

**Автоматизация:** частичные unit-контракты [authRoutes.test.ts](../../../apps/server/src/auth/authRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#316 (CLOSED, закрыта 2026-07-29)](https://github.com/SuselMan/art_lessons/issues/316), [#116 (CLOSED, закрыта 2026-07-05)](https://github.com/SuselMan/art_lessons/issues/116). Статус нового запуска: NOT RUN.

<a id="qa-410"></a>

## QA-410 — Смена email при входе

**Начало и участники:** Браузер уже вошёл в аккаунт A; существует B.

**Действия:** Войти кодом B и проверить данные A/B.

**Ожидание:** Вход не переименовывает аккаунт A в B и не отдаёт чужие проекты.

**Автоматизация:** частичные unit-контракты [authRoutes.test.ts](../../../apps/server/src/auth/authRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#316 (CLOSED, закрыта 2026-07-29)](https://github.com/SuselMan/art_lessons/issues/316). Статус нового запуска: NOT RUN.

<a id="qa-411"></a>

## QA-411 — Код не выдаётся production клиенту

**Начало и участники:** Production env; отдельно provider configured и dev без mailbox.

**Действия:** Запросить код во всех режимах.

**Ожидание:** Код никогда не включён в production/provider response; dev shortcut ограничен предусмотренным режимом.

**Автоматизация:** частичные unit-контракты [authRoutes.test.ts](../../../apps/server/src/auth/authRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#353 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/353), [#356 (CLOSED, закрыта 2026-07-29)](https://github.com/SuselMan/art_lessons/issues/356). Статус нового запуска: NOT RUN.

<a id="qa-412"></a>

## QA-412 — Бан до и после отправки кода

**Начало и участники:** Администратор, пользователь с выданным кодом.

**Действия:** Забанить адрес до request, затем отдельного пользователя после request до redeem.

**Ожидание:** Забаненному письмо/вход запрещены; ранее выданный код не обходит ban.

**Автоматизация:** частичные unit-контракты [authRoutes.test.ts](../../../apps/server/src/auth/authRoutes.test.ts), [adminRoutes.test.ts](../../../apps/server/src/admin/adminRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#587 (CLOSED, закрыта 2026-09-24)](https://github.com/SuselMan/art_lessons/issues/587). Статус нового запуска: NOT RUN.

<a id="qa-413"></a>

## QA-413 — Отзыв сессий

**Начало и участники:** Аккаунт с двумя активными сокетами и HTTP cookie.

**Действия:** Отозвать токены администратором, повторить /api/me и socket-вход.

**Ожидание:** Старые токены больше не действуют, live sockets закрыты; восстановление гостя не возвращает отозванный доступ.

**Автоматизация:** частичные unit-контракты [authRoutes.test.ts](../../../apps/server/src/auth/authRoutes.test.ts), [adminRoutes.test.ts](../../../apps/server/src/admin/adminRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#585 (CLOSED, закрыта 2026-09-24)](https://github.com/SuselMan/art_lessons/issues/585), [#587 (CLOSED, закрыта 2026-09-24)](https://github.com/SuselMan/art_lessons/issues/587). Статус нового запуска: NOT RUN.

<a id="qa-414"></a>

## QA-414 — Идентификатор устройства и IP

**Начало и участники:** HTTP и socket за разрешённым proxy.

**Действия:** Повторить запросы, передать некорректный device-id, IPv4-mapped и forwarded-chain.

**Ожидание:** Device cookie стабилен, принимается только допустимый UUID, IP нормализован по доверенному proxy.

**Автоматизация:** частичные unit-контракты [sessions.test.ts](../../../apps/server/src/auth/sessions.test.ts), [authRoutes.test.ts](../../../apps/server/src/auth/authRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#590 (CLOSED, закрыта 2026-09-24)](https://github.com/SuselMan/art_lessons/issues/590). Статус нового запуска: NOT RUN.

## Доступ и участники

<a id="qa-415"></a>

## QA-415 — Владелец не определяется гонкой join

**Начало и участники:** Свежий owner и второй browser без localStorage комнаты.

**Действия:** Создать комнату, почти одновременно войти обоим.

**Ожидание:** Создатель teacher независимо от порядка входа; второй видит серверный конфиг и рисунок.

**Автоматизация:** частичные unit-контракты [rooms.test.ts](../../../apps/server/src/rooms/rooms.test.ts), [socketHandlers.test.ts](../../../apps/server/src/rooms/socketHandlers.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#39 (CLOSED, закрыта 2026-07-05)](https://github.com/SuselMan/art_lessons/issues/39), [#85 (CLOSED, закрыта 2026-07-05)](https://github.com/SuselMan/art_lessons/issues/85). Статус нового запуска: NOT RUN.

<a id="qa-416"></a>

## QA-416 — Открытая комната с паролем

**Начало и участники:** Owner и новый участник; password установлен.

**Действия:** Войти без пароля, с неверным, затем правильным.

**Ожидание:** Отказ не раскрывает content; правильный пароль открывает комнату и сохраняет разрешение.

**Автоматизация:** частичные unit-контракты [roomAccess.test.ts](../../../apps/server/src/rooms/roomAccess.test.ts), [socketHandlers.test.ts](../../../apps/server/src/rooms/socketHandlers.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#225 (CLOSED, закрыта 2026-07-31)](https://github.com/SuselMan/art_lessons/issues/225), [#513 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/513). Статус нового запуска: NOT RUN.

<a id="qa-417"></a>

## QA-417 — Приглашение по email

**Начало и участники:** Комната invite-only, guest и зарегистрированный приглашённый.

**Действия:** Добавить email с пробелами/регистром, войти обоими, удалить приглашение.

**Ожидание:** Адрес нормализован, доступ получает нужный аккаунт; удаление/отзыв соответствует политике.

**Автоматизация:** частичные unit-контракты [roomAccess.test.ts](../../../apps/server/src/rooms/roomAccess.test.ts), [roomAccessRoutes.test.ts](../../../apps/server/src/roomRoutes/roomAccessRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#224 (CLOSED, закрыта 2026-07-31)](https://github.com/SuselMan/art_lessons/issues/224), [#225 (CLOSED, закрыта 2026-07-31)](https://github.com/SuselMan/art_lessons/issues/225), [#226 (CLOSED, закрыта 2026-07-31)](https://github.com/SuselMan/art_lessons/issues/226). Статус нового запуска: NOT RUN.

<a id="qa-418"></a>

## QA-418 — Очередь ожидания

**Начало и участники:** Teacher и незнакомый student, access mode с запросом.

**Действия:** Student просит вход; teacher открывает панель и approves.

**Ожидание:** Pending request виден один раз; approval уведомляет обе стороны и открывает доступ.

**Автоматизация:** частичные unit-контракты [roomAccess.test.ts](../../../apps/server/src/rooms/roomAccess.test.ts), [roomAccessRoutes.test.ts](../../../apps/server/src/roomRoutes/roomAccessRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#227 (CLOSED, закрыта 2026-07-31)](https://github.com/SuselMan/art_lessons/issues/227), [#380 (CLOSED, закрыта 2026-08-04)](https://github.com/SuselMan/art_lessons/issues/380). Статус нового запуска: NOT RUN.

<a id="qa-419"></a>

## QA-419 — Отказ запроса и чужой requestId

**Начало и участники:** Есть pending запросы в двух разных комнатах.

**Действия:** Deny свой запрос, попытаться разрешить чужой room request.

**Ожидание:** Свой отказ доставлен; чужое разрешение невозможно; resolved не остаётся в pending списке.

**Автоматизация:** частичные unit-контракты [roomAccessRoutes.test.ts](../../../apps/server/src/roomRoutes/roomAccessRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#226 (CLOSED, закрыта 2026-07-31)](https://github.com/SuselMan/art_lessons/issues/226), [#227 (CLOSED, закрыта 2026-07-31)](https://github.com/SuselMan/art_lessons/issues/227). Статус нового запуска: NOT RUN.

<a id="qa-420"></a>

## QA-420 — Invitation разрешает ожидающий запрос

**Начало и участники:** Участник уже стоит в waiting queue.

**Действия:** Пригласить тот же email, затем проверить очередь и вход.

**Ожидание:** Приглашение разрешает соответствующий запрос без дубля и не делает owner заявителем.

**Автоматизация:** частичные unit-контракты [roomAccessRoutes.test.ts](../../../apps/server/src/roomRoutes/roomAccessRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#226 (CLOSED, закрыта 2026-07-31)](https://github.com/SuselMan/art_lessons/issues/226). Статус нового запуска: NOT RUN.

<a id="qa-421"></a>

## QA-421 — Block участника и unblock

**Начало и участники:** Участник приглашён и уже был в уроке.

**Действия:** Owner блокирует его; повторить socket/HTTP вход; снять block.

**Ожидание:** Block закрывает доступ и очищает invite; unblock снимает только block, прежнее приглашение само не возвращается.

**Автоматизация:** частичные unit-контракты [roomAccessRoutes.test.ts](../../../apps/server/src/roomRoutes/roomAccessRoutes.test.ts), [roomAccess.test.ts](../../../apps/server/src/rooms/roomAccess.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#224 (CLOSED, закрыта 2026-07-31)](https://github.com/SuselMan/art_lessons/issues/224), [#226 (CLOSED, закрыта 2026-07-31)](https://github.com/SuselMan/art_lessons/issues/226). Статус нового запуска: NOT RUN.

<a id="qa-422"></a>

## QA-422 — Owner не блокирует себя

**Начало и участники:** Owner, участник и неизвестный userId.

**Действия:** Вызвать block себя, пустой userId, неизвестного пользователя.

**Ожидание:** Owner остаётся владельцем, неверные запросы дают 400/404 без изменения доступа.

**Автоматизация:** частичные unit-контракты [roomAccessRoutes.test.ts](../../../apps/server/src/roomRoutes/roomAccessRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#226 (CLOSED, закрыта 2026-07-31)](https://github.com/SuselMan/art_lessons/issues/226). Статус нового запуска: NOT RUN.

<a id="qa-423"></a>

## QA-423 — Изменение режима и password

**Начало и участники:** Owner с открытой панелью доступа и peer.

**Действия:** Изменить accessMode; отдельно установить пароль, null удалить, пустой отказать.

**Ожидание:** Режим и пароль меняются независимо; live room уведомлена; невалидный patch не имитирует успех.

**Автоматизация:** частичные unit-контракты [roomAccessRoutes.test.ts](../../../apps/server/src/roomRoutes/roomAccessRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#224 (CLOSED, закрыта 2026-07-31)](https://github.com/SuselMan/art_lessons/issues/224), [#226 (CLOSED, закрыта 2026-07-31)](https://github.com/SuselMan/art_lessons/issues/226). Статус нового запуска: NOT RUN.

<a id="qa-424"></a>

## QA-424 — Контент дочерней доски

**Начало и участники:** Доска принадлежит lesson, участники с разным доступом.

**Действия:** Запросить snapshots/thumbnail/review дочерней доски, обойти урок прямым boardId.

**Ожидание:** Проверяется lesson content access и block, чужой boardId не даёт обхода.

**Автоматизация:** частичные unit-контракты [boardContentAccess.test.ts](../../../apps/server/src/rooms/boardContentAccess.test.ts), [snapshotRoutes.test.ts](../../../apps/server/src/roomRoutes/snapshotRoutes.test.ts), [reviewRoutes.test.ts](../../../apps/server/src/roomRoutes/reviewRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#564 (CLOSED, закрыта 2026-09-23)](https://github.com/SuselMan/art_lessons/issues/564), [#741 (CLOSED, закрыта 2026-10-09)](https://github.com/SuselMan/art_lessons/issues/741). Статус нового запуска: NOT RUN.

<a id="qa-425"></a>

## QA-425 — Доступ HTTP после разрыва socket

**Объединённый дубль:** основной кейс [QA-334](browser.md#qa-334); этот ID сохранён для истории, отдельно не считать и не запускать.


**Начало и участники:** Участник успешно вошёл; cookie не меняется.

**Действия:** Отключить socket и читать snapshot/history; затем сменить пароль.

**Ожидание:** Сохранённое успешное участие действует без socket; старая password revision отозвана, owner доступен.

**Автоматизация:** частичные unit-контракты [boardContentAccess.test.ts](../../../apps/server/src/rooms/boardContentAccess.test.ts), [snapshotRoutes.test.ts](../../../apps/server/src/roomRoutes/snapshotRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#741 (CLOSED, закрыта 2026-10-09)](https://github.com/SuselMan/art_lessons/issues/741). Статус нового запуска: NOT RUN.

<a id="qa-426"></a>

## QA-426 — Доступ после удаления пользователя

**Начало и участники:** Cookie указывает на удалённую user row.

**Действия:** Создать/войти/сохранить комнату через HTTP и socket.

**Ожидание:** Не возникает несуществующего владельца и несохраняемой комнаты; identity восстановлена согласованно.

**Автоматизация:** частичные unit-контракты [identity.test.ts](../../../apps/server/src/auth/identity.test.ts), [socketHandlers.test.ts](../../../apps/server/src/rooms/socketHandlers.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#695 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/695). Статус нового запуска: NOT RUN.

<a id="qa-586"></a>

## QA-586 — Личные доски и приватность класса

**Начало и участники:** Teacher, два students, assignment и режим teacher_only.

**Действия:** Раздать задание, studentA пробует открыть доскуB; teacher её открывает; изменить class visibility.

**Ожидание:** В приватном режиме видят владелец/teacher; режим просмотра не даёт однокласснику права рисовать.

**Автоматизация:** частичные unit-контракты [classMode.test.ts](../../../apps/server/src/rooms/classMode.test.ts), [boardContentAccess.test.ts](../../../apps/server/src/rooms/boardContentAccess.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#595 (CLOSED, закрыта 2026-09-24)](https://github.com/SuselMan/art_lessons/issues/595), [#600](https://github.com/SuselMan/art_lessons/issues/600). Статус нового запуска: NOT RUN.

<a id="qa-587"></a>

## QA-587 — Live stroke чужой личной доски

**Начало и участники:** Class visibility позволяет смотреть, A не владеет доскойB.

**Действия:** Отправить stroke и stroke_live на чужую личную доску.

**Ожидание:** Отказаны и durable, и live delivery; preview не обходит operation gate.

**Автоматизация:** частичные unit-контракты [classMode.test.ts](../../../apps/server/src/rooms/classMode.test.ts), [operationGate.test.ts](../../../apps/server/src/rooms/operationGate.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#595 (CLOSED, закрыта 2026-09-24)](https://github.com/SuselMan/art_lessons/issues/595). Статус нового запуска: NOT RUN.

## Проекты и копии

<a id="qa-427"></a>

## QA-427 — Список только своих уроков

**Начало и участники:** Два аккаунта, урок с несколькими boards, гостевые участия.

**Действия:** Открыть mine и поиск с q/пустым q.

**Ожидание:** Только доступные lessons, не дочерние boards; пустой запрос не запускает лишний поиск.

**Автоматизация:** частичные unit-контракты [roomRoutes.test.ts](../../../apps/server/src/roomRoutes/roomRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#116 (CLOSED, закрыта 2026-07-05)](https://github.com/SuselMan/art_lessons/issues/116), [#211 (CLOSED, закрыта 2026-07-22)](https://github.com/SuselMan/art_lessons/issues/211), [#564 (CLOSED, закрыта 2026-09-23)](https://github.com/SuselMan/art_lessons/issues/564). Статус нового запуска: NOT RUN.

<a id="qa-428"></a>

## QA-428 — Папки списка и права

**Начало и участники:** Два владельца, вложенные папки, урок в папке.

**Действия:** Переместить урок в свою папку и root; попробовать чужую; открыть прямых детей.

**Ожидание:** Список scoped к владельцу, чужие папки недоступны, root и direct children корректны.

**Автоматизация:** частичные unit-контракты [roomFolderRoutes.test.ts](../../../apps/server/src/roomRoutes/roomFolderRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#215 (CLOSED, закрыта 2026-07-22)](https://github.com/SuselMan/art_lessons/issues/215). Статус нового запуска: NOT RUN.

<a id="qa-429"></a>

## QA-429 — Цикл папок проектов

**Начало и участники:** Есть A→B и пустая C.

**Действия:** Переместить A в себя/потомка B, затем C в B.

**Ожидание:** Циклы отказаны, допустимый перенос выполнен.

**Автоматизация:** частичные unit-контракты [roomFolderRoutes.test.ts](../../../apps/server/src/roomRoutes/roomFolderRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#215 (CLOSED, закрыта 2026-07-22)](https://github.com/SuselMan/art_lessons/issues/215). Статус нового запуска: NOT RUN.

<a id="qa-430"></a>

## QA-430 — Удаление непустой папки проектов

**Начало и участники:** Папка с комнатой, папка с подпапкой, пустая папка.

**Действия:** Попытаться удалить каждую, в том числе чужую.

**Ожидание:** Непустые защищены; только своя пустая удалена.

**Автоматизация:** частичные unit-контракты [roomFolderRoutes.test.ts](../../../apps/server/src/roomRoutes/roomFolderRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#215 (CLOSED, закрыта 2026-07-22)](https://github.com/SuselMan/art_lessons/issues/215). Статус нового запуска: NOT RUN.

<a id="qa-431"></a>

## QA-431 — Выход участника из коллекции

**Начало и участники:** Owner и участник урока.

**Действия:** Участник выполняет leave; owner пытается тем же путём покинуть своё; outsider покидает незнакомое.

**Ожидание:** Удалена только нужная RoomParticipant; owner не теряет урок, чужие данные не затронуты.

**Автоматизация:** частичные unit-контракты [roomRoutes.test.ts](../../../apps/server/src/roomRoutes/roomRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#213 (CLOSED, закрыта 2026-07-22)](https://github.com/SuselMan/art_lessons/issues/213). Статус нового запуска: NOT RUN.

<a id="qa-432"></a>

## QA-432 — Rename без сброса холста

**Объединённый дубль:** основной кейс [QA-305](browser.md#qa-305); этот ID сохранён для истории, отдельно не считать и не запускать.


**Начало и участники:** Непустой урок с несколькими слоями и peer.

**Действия:** Переименовать в шапке; повторить отказ/blank/не-owner.

**Ожидание:** Имя меняется только у владельца; engine и pixels не пересозданы, ошибка не стирает рисунок.

**Автоматизация:** частичные unit-контракты [engineWiring.test.ts](../../../apps/web/src/pages/Room/engineWiring.test.ts), [roomRoutes.test.ts](../../../apps/server/src/roomRoutes/roomRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#461 (CLOSED, закрыта 2026-08-17)](https://github.com/SuselMan/art_lessons/issues/461), [#496 (CLOSED, закрыта 2026-08-24)](https://github.com/SuselMan/art_lessons/issues/496). Статус нового запуска: NOT RUN.

<a id="qa-433"></a>

## QA-433 — Копия в исходной папке

**Начало и участники:** Урок в папке, owner и участник с собственной коллекцией.

**Действия:** Скопировать урок владельцем и участником.

**Ожидание:** Копия размещена по действующим правилам folder ownership, без присваивания чужой папки.

**Автоматизация:** частичные unit-контракты [forkRoutes.test.ts](../../../apps/server/src/roomRoutes/forkRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#552 (CLOSED, закрыта 2026-09-10)](https://github.com/SuselMan/art_lessons/issues/552). Статус нового запуска: NOT RUN.

<a id="qa-434"></a>

## QA-434 — Права и настройки копии

**Начало и участники:** Урок закрыт, защищён паролем и имеет палитру.

**Действия:** Скопировать допустимым автором; отдельно outsider.

**Ожидание:** Копия принадлежит запросившему, provenance сохранён, ограничения источника не наследуются неверно, палитра сохранена.

**Автоматизация:** частичные unit-контракты [forkRoutes.test.ts](../../../apps/server/src/roomRoutes/forkRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#418 (CLOSED, закрыта 2026-08-24)](https://github.com/SuselMan/art_lessons/issues/418), [#568 (CLOSED, закрыта 2026-09-23)](https://github.com/SuselMan/art_lessons/issues/568). Статус нового запуска: NOT RUN.

<a id="qa-435"></a>

## QA-435 — Новые ID операций копии

**Начало и участники:** У источника есть stroke и Undo; snapshots+tail.

**Действия:** Скопировать и сравнить payload ids, target Undo и seq.

**Ожидание:** Inherited IDs переназначены включая вложенные ссылки, seq согласован со snapshot, старый автор не отменяет унаследованное.

**Автоматизация:** частичные unit-контракты [forkRoutes.test.ts](../../../apps/server/src/roomRoutes/forkRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#498 (CLOSED, закрыта 2026-08-24)](https://github.com/SuselMan/art_lessons/issues/498). Статус нового запуска: NOT RUN.

<a id="qa-436"></a>

## QA-436 — Структурные операции в копии

**Начало и участники:** Слои и папки источника созданы до последнего snapshot.

**Действия:** Скопировать, удалить/перенести слой, Undo/Redo и перезайти.

**Ожидание:** Скопирован structural log, target_gone не возникает для живого слоя; структура восстанавливается.

**Автоматизация:** частичные unit-контракты [forkRoutes.test.ts](../../../apps/server/src/roomRoutes/forkRoutes.test.ts), [structuralLog.test.ts](../../../apps/server/src/rooms/structuralLog.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#498 (CLOSED, закрыта 2026-08-24)](https://github.com/SuselMan/art_lessons/issues/498). Статус нового запуска: NOT RUN.

<a id="qa-437"></a>

## QA-437 — Копия тяжёлой комнаты без полной кучи

**Начало и участники:** Длинный source log, snapshots некоторых слоёв, слой без snapshot.

**Действия:** Копировать с ограниченным resident window; отдельно source без снимков.

**Ожидание:** Не читаются blobs/stroke payload целиком в процесс; без snapshot нужная история не потеряна, chunk SQL корректен.

**Автоматизация:** частичные unit-контракты [forkRoutes.test.ts](../../../apps/server/src/roomRoutes/forkRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#418 (CLOSED, закрыта 2026-08-24)](https://github.com/SuselMan/art_lessons/issues/418). Статус нового запуска: NOT RUN.

<a id="qa-438"></a>

## QA-438 — Копия урока со всеми досками

**Начало и участники:** Урок с несколькими boards и разными рисунками.

**Действия:** Copy whole lesson; отдельно взять в работу конкретную доску.

**Ожидание:** В первой копии все boards со своим контентом; take-board не смешивает рисунки соседей.

**Автоматизация:** частичные unit-контракты [forkRoutes.test.ts](../../../apps/server/src/roomRoutes/forkRoutes.test.ts), [classMode.test.ts](../../../apps/server/src/rooms/classMode.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#568 (CLOSED, закрыта 2026-09-23)](https://github.com/SuselMan/art_lessons/issues/568). Статус нового запуска: NOT RUN.

<a id="qa-439"></a>

## QA-439 — Превью после ухода socket

**Начало и участники:** Участник нарисовал и закрывает редактор.

**Действия:** Отправить thumbnail после disconnect; повторить blocked/ex-participant и outsider.

**Ожидание:** Успешный участник сохраняет превью без живого socket; blocked/outsider отказаны.

**Автоматизация:** частичные unit-контракты [thumbnailRoutes.test.ts](../../../apps/server/src/roomRoutes/thumbnailRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#382 (CLOSED, закрыта 2026-08-04)](https://github.com/SuselMan/art_lessons/issues/382), [#738 (CLOSED, закрыта 2026-10-07)](https://github.com/SuselMan/art_lessons/issues/738). Статус нового запуска: NOT RUN.

<a id="qa-440"></a>

## QA-440 — Валидация и кеширование thumbnail

**Начало и участники:** Есть допустимые PNG/WebP и oversized/corrupt файлы.

**Действия:** POST каждого; GET/If-None-Match, частые uploads, board preview.

**Ожидание:** Corrupt/oversized отказаны; mime/ETag/304 корректны, rate limit не смешивает boards и соседей.

**Автоматизация:** частичные unit-контракты [thumbnailRoutes.test.ts](../../../apps/server/src/roomRoutes/thumbnailRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#210 (CLOSED, закрыта 2026-07-22)](https://github.com/SuselMan/art_lessons/issues/210), [#738 (CLOSED, закрыта 2026-10-07)](https://github.com/SuselMan/art_lessons/issues/738). Статус нового запуска: NOT RUN.

<a id="qa-580"></a>

## QA-580 — Создание с custom размером

**Начало и участники:** Чистый профиль и форма CreateRoom.

**Действия:** Ввести пустое имя, недопустимые/нечисловые custom размеры, затем допустимый размер и создать.

**Ожидание:** Ошибки показаны до навигации/создания; принятые размеры и paper config совпадают с сервером и canvas; границы брать из текущей формы.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Источники/дефекты:** [#26 (CLOSED, закрыта 2026-07-05)](https://github.com/SuselMan/art_lessons/issues/26), [#28 (CLOSED, закрыта 2026-07-05)](https://github.com/SuselMan/art_lessons/issues/28), [#29 (CLOSED, закрыта 2026-07-05)](https://github.com/SuselMan/art_lessons/issues/29). Статус нового запуска: NOT RUN.

<a id="qa-581"></a>

## QA-581 — Бумага, цвет и enabled tools при создании

**Начало и участники:** Новая комната с выбранными paper/paperColor и ограниченным toolset.

**Действия:** Создать, войти другим устройством и открыть tool chooser; reload обоих.

**Ожидание:** Настройки общие и восстановлены; недоступные материалы не появляются как случайный default.

**Автоматизация:** частичные unit-контракты [toolset.test.ts](../../../packages/shared/src/toolset.test.ts), [rooms.test.ts](../../../apps/server/src/rooms/rooms.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#27 (CLOSED, закрыта 2026-07-05)](https://github.com/SuselMan/art_lessons/issues/27), [#273 (CLOSED, закрыта 2026-07-22)](https://github.com/SuselMan/art_lessons/issues/273). Статус нового запуска: NOT RUN.

<a id="qa-582"></a>

## QA-582 — Приглашение с другого устройства

**Начало и участники:** Комната создана автором, другой browser не имеет localStorage/куки первого.

**Действия:** Скопировать invite через шапку и карточку проекта, открыть ссылку на другом устройстве.

**Ожидание:** Вход использует server config, сохранён room/boardId; не требуется локальная запись создателя.

**Автоматизация:** частичные unit-контракты [shareRoom.test.ts](../../../apps/web/src/lib/api/shareRoom.test.ts), [socketHandlers.test.ts](../../../apps/server/src/rooms/socketHandlers.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#30 (CLOSED, закрыта 2026-07-05)](https://github.com/SuselMan/art_lessons/issues/30), [#85 (CLOSED, закрыта 2026-07-05)](https://github.com/SuselMan/art_lessons/issues/85), [#460 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/460). Статус нового запуска: NOT RUN.

<a id="qa-583"></a>

## QA-583 — Создание и rename доски

**Начало и участники:** Owner урока и participant, доска с рисунком.

**Действия:** Owner создаёт и переименовывает board; повторить blank name, чужой lessonId и не-owner; обратиться к board как родителю.

**Ожидание:** Проверены owner/lesson scope; вложенных board-уроков нет, урок может быть первой доской без потери контента.

**Автоматизация:** частичные unit-контракты [boardRoutes.test.ts](../../../apps/server/src/roomRoutes/boardRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#176 (CLOSED, закрыта 2026-09-23)](https://github.com/SuselMan/art_lessons/issues/176), [#564 (CLOSED, закрыта 2026-09-23)](https://github.com/SuselMan/art_lessons/issues/564). Статус нового запуска: NOT RUN.

<a id="qa-584"></a>

## QA-584 — Порядок досок

**Начало и участники:** Урок и несколько boards.

**Действия:** Переместить board в начало/конец, попытаться переместить сам lesson и выйти за границы.

**Ожидание:** Первая доска-урок остаётся первой; позиции изменяются атомарно и только нужные.

**Автоматизация:** частичные unit-контракты [boardRoutes.test.ts](../../../apps/server/src/roomRoutes/boardRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#176 (CLOSED, закрыта 2026-09-23)](https://github.com/SuselMan/art_lessons/issues/176), [#564 (CLOSED, закрыта 2026-09-23)](https://github.com/SuselMan/art_lessons/issues/564). Статус нового запуска: NOT RUN.

<a id="qa-585"></a>

## QA-585 — Удаление текущей доски

**Начало и участники:** На board находится ученик, она active у teacher.

**Действия:** Удалить её, задержать уведомление, reload ученика; попытаться удалить lesson этим endpoint.

**Ожидание:** Сначала участники переведены на доступную доску, activeBoard обновлён атомарно; lesson защищён.

**Автоматизация:** частичные unit-контракты [boardRoutes.test.ts](../../../apps/server/src/roomRoutes/boardRoutes.test.ts), [boards.test.ts](../../../apps/server/src/rooms/boards.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#176 (CLOSED, закрыта 2026-09-23)](https://github.com/SuselMan/art_lessons/issues/176), [#564 (CLOSED, закрыта 2026-09-23)](https://github.com/SuselMan/art_lessons/issues/564). Статус нового запуска: NOT RUN.

<a id="qa-588"></a>

## QA-588 — Опоздавший ученик получает работу

**Начало и участники:** Assignment создан до входа ученика; учитель возвращает класс к заданию.

**Действия:** Войти поздно, переключить class location, проверить выдачу и уведомления других.

**Ожидание:** У ученика одна собственная доска; чужим не раскрыта лишняя приватная информация.

**Автоматизация:** частичные unit-контракты [classMode.test.ts](../../../apps/server/src/rooms/classMode.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#595 (CLOSED, закрыта 2026-09-24)](https://github.com/SuselMan/art_lessons/issues/595). Статус нового запуска: NOT RUN.

<a id="qa-589"></a>

## QA-589 — Spotlight не меняет собственность доски

**Начало и участники:** Класс на разных boards, teacher смотрит student board.

**Действия:** Показать student work всем, выключить, выполнить повторный перевод туда же.

**Ожидание:** Работа видна в spotlight только пока разрешено; личная доска не становится teacher activeBoard автоматически; повтор не сбивает spotlight.

**Автоматизация:** частичные unit-контракты [classMode.test.ts](../../../apps/server/src/rooms/classMode.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#595 (CLOSED, закрыта 2026-09-24)](https://github.com/SuselMan/art_lessons/issues/595), [#600](https://github.com/SuselMan/art_lessons/issues/600). Статус нового запуска: NOT RUN.

<a id="qa-590"></a>

## QA-590 — Поднятая рука

**Начало и участники:** Teacher и два students в разных boards одного lesson.

**Действия:** А поднимает/опускает руку, Б пытается опустить А, teacher опускает; новый участник входит.

**Ожидание:** Состояние транслируется по уроку и есть в lesson_state; чужой student не управляет рукой А.

**Автоматизация:** частичные unit-контракты [classMode.test.ts](../../../apps/server/src/rooms/classMode.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#595 (CLOSED, закрыта 2026-09-24)](https://github.com/SuselMan/art_lessons/issues/595). Статус нового запуска: NOT RUN.

## Слои и структура

<a id="qa-441"></a>

## QA-441 — Drop слоя в закрытую папку

**Начало и участники:** Один слой с рисунком, закрытая папка, наблюдатель.

**Действия:** Перетащить слой на header закрытой папки, открыть и перезайти.

**Ожидание:** Слой внутри нужной папки с теми же пикселями и общим порядком.

**Автоматизация:** частичные unit-контракты [layers.test.ts](../../../apps/web/src/lib/layers/layers.test.ts), [flatList.test.ts](../../../apps/web/src/components/LayerPanel/flatList.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#65 (CLOSED, закрыта 2026-07-01)](https://github.com/SuselMan/art_lessons/issues/65). Статус нового запуска: NOT RUN.

<a id="qa-442"></a>

## QA-442 — Перенос папки с содержимым

**Начало и участники:** Открытая папка с несколькими слоями и вложенной папкой.

**Действия:** Перетащить header между sibling folders; Undo/Redo.

**Ожидание:** Переезжает целое поддерево, дети не теряются и не остаются в старом месте.

**Автоматизация:** частичные unit-контракты [layers.test.ts](../../../apps/web/src/lib/layers/layers.test.ts), [flatList.test.ts](../../../apps/web/src/components/LayerPanel/flatList.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#66 (CLOSED, закрыта 2026-07-01)](https://github.com/SuselMan/art_lessons/issues/66), [#410 (CLOSED, закрыта 2026-08-10)](https://github.com/SuselMan/art_lessons/issues/410). Статус нового запуска: NOT RUN.

<a id="qa-443"></a>

## QA-443 — Вложенные папки и запрет цикла

**Начало и участники:** Разрешённые текущей версией nested folders.

**Действия:** Вложить папку в другую, затем попробовать в себя и своего потомка, включая peer operation.

**Ожидание:** Допустимая вложенность сохранена, циклы отвергнуты при replay; старый запрет 67 superseded задачей 410.

**Автоматизация:** частичные unit-контракты [layers.test.ts](../../../apps/web/src/lib/layers/layers.test.ts), [structuralLog.test.ts](../../../apps/server/src/rooms/structuralLog.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#67 (CLOSED, закрыта 2026-07-01)](https://github.com/SuselMan/art_lessons/issues/67), [#410 (CLOSED, закрыта 2026-08-10)](https://github.com/SuselMan/art_lessons/issues/410). Статус нового запуска: NOT RUN.

<a id="qa-444"></a>

## QA-444 — Merge внутри папки

**Начало и участники:** Два слоя внутри папки и соседний корневой слой.

**Действия:** Merge down внутренних слоёв, Undo/Redo.

**Ожидание:** Результат остаётся в правильной папке и stacking position, соседний слой не сдвинут ошибочно.

**Автоматизация:** частичные unit-контракты [layers.test.ts](../../../apps/web/src/lib/layers/layers.test.ts), [index.structuralUndo.test.ts](../../../apps/web/src/engine/index.structuralUndo.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#77 (CLOSED, закрыта 2026-07-08)](https://github.com/SuselMan/art_lessons/issues/77). Статус нового запуска: NOT RUN.

<a id="qa-445"></a>

## QA-445 — Merge/delete с чужим содержимым

**Начало и участники:** А создал слой, Б нарисовал в нём.

**Действия:** А удаляет слой, отменяет своё layer_add и делает merge; для каждого подтвердить/отменить предупреждение.

**Ожидание:** Потеря чужого контента не происходит молча; Cancel не меняет рисунок, Undo восстанавливает согласованный результат.

**Автоматизация:** частичные unit-контракты [index.structuralUndo.test.ts](../../../apps/web/src/engine/index.structuralUndo.test.ts), [layers.test.ts](../../../apps/web/src/lib/layers/layers.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#171 (CLOSED, закрыта 2026-07-19)](https://github.com/SuselMan/art_lessons/issues/171), [#263 (CLOSED, закрыта 2026-07-22)](https://github.com/SuselMan/art_lessons/issues/263). Статус нового запуска: NOT RUN.

<a id="qa-446"></a>

## QA-446 — Восстановление слоя после merge/delete

**Начало и участники:** Слои с давно запечённым контентом и коротким локальным log window.

**Действия:** Удалить либо merge, Undo, дождаться snapshot, перезайти новым клиентом.

**Ожидание:** Воскресший слой имеет прежние pixels, не пустой; дефект 522 остаётся отдельным gate.

**Автоматизация:** частичные unit-контракты [index.revivedLayer.test.ts](../../../apps/web/src/engine/index.revivedLayer.test.ts), [index.restoredBaseLayers.test.ts](../../../apps/web/src/engine/index.restoredBaseLayers.test.ts), [index.structuralSnapshot.test.ts](../../../apps/web/src/engine/index.structuralSnapshot.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#522 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/522). Статус нового запуска: NOT RUN.

<a id="qa-447"></a>

## QA-447 — Undo удаления в серверном зеркале

**Начало и участники:** Живой слой известен серверу, peer подключён.

**Действия:** Delete, Undo delete, затем stroke/image_import/layer_clear в восстановленный слой.

**Ожидание:** Сервер считает слой живым, новые операции не отвергаются как target_gone.

**Автоматизация:** частичные unit-контракты [operationGate.test.ts](../../../apps/server/src/rooms/operationGate.test.ts), [structuralLog.test.ts](../../../apps/server/src/rooms/structuralLog.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#368 (CLOSED, закрыта 2026-08-06)](https://github.com/SuselMan/art_lessons/issues/368). Статус нового запуска: NOT RUN.

<a id="qa-448"></a>

## QA-448 — Hidden слой не принимает рисунок

**Начало и участники:** Скрытый слой внутри видимой либо скрытой папки.

**Действия:** Пытаться рисовать, fill и paste; включить видимость и повторить.

**Ожидание:** Эффективная видимость проверяется, скрытый материал не меняется до явного разрешения.

**Автоматизация:** частичные unit-контракты [activeLayer.test.ts](../../../apps/web/src/pages/Room/editing/activeLayer.test.ts), [layers.test.ts](../../../apps/web/src/lib/layers/layers.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#359 (CLOSED, закрыта 2026-07-30)](https://github.com/SuselMan/art_lessons/issues/359). Статус нового запуска: NOT RUN.

<a id="qa-449"></a>

## QA-449 — Локальный и владельческий замок

**Начало и участники:** А owner, Б student; один слой.

**Действия:** Включить локальный lock, перезагрузить А, проверить Б; отдельно owner-lock и direct transform op от Б.

**Ожидание:** Локальный lock сохраняется только у автора; owner-lock соблюдается и на server transform gate, не только pointer start.

**Автоматизация:** частичные unit-контракты [operationGate.test.ts](../../../apps/server/src/rooms/operationGate.test.ts), [activeLayer.test.ts](../../../apps/web/src/pages/Room/editing/activeLayer.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#488 (CLOSED, закрыта 2026-08-24)](https://github.com/SuselMan/art_lessons/issues/488), [#451 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/451), [#518 (CLOSED, закрыта 2026-08-31)](https://github.com/SuselMan/art_lessons/issues/518). Статус нового запуска: NOT RUN.

<a id="qa-450"></a>

## QA-450 — Замок всех редакторских действий

**Начало и участники:** Locked слой с выделением и импортом.

**Действия:** Попытаться transform/fill/Delete/Cut/Paste/shape/filter обычным UI и разрешённым API.

**Ожидание:** Ни один путь не изменяет защищённые pixels; разблокировка возвращает редактирование.

**Автоматизация:** частичные unit-контракты [activeLayer.test.ts](../../../apps/web/src/pages/Room/editing/activeLayer.test.ts), [operationGate.test.ts](../../../apps/server/src/rooms/operationGate.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#518 (CLOSED, закрыта 2026-08-31)](https://github.com/SuselMan/art_lessons/issues/518). Статус нового запуска: NOT RUN.

<a id="qa-451"></a>

## QA-451 — Дубликат слоя и папки

**Начало и участники:** Нарисованное поддерево с opacity/blend и peer.

**Действия:** Duplicate layer и whole folder, затем Undo/Redo и reload.

**Ожидание:** Новые ID не конфликтуют, весь контент/порядок скопирован, исходник не тронут.

**Автоматизация:** частичные unit-контракты [index.layerDuplicate.test.ts](../../../apps/web/src/engine/index.layerDuplicate.test.ts), [duplicate.test.ts](../../../apps/web/src/components/LayerPanel/duplicate.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#449 (CLOSED, закрыта 2026-08-13)](https://github.com/SuselMan/art_lessons/issues/449). Статус нового запуска: NOT RUN.

<a id="qa-452"></a>

## QA-452 — Активный слой после reload

**Начало и участники:** Два слоя, на устройстве А выбран второй, Б первый.

**Действия:** Reload А, удалить выбранный слой peer и Undo delete.

**Ожидание:** Допустимый локальный выбор восстанавливается; при недоступности есть корректный fallback, выбор Б не перезаписан.

**Автоматизация:** частичные unit-контракты [activeLayer.test.ts](../../../apps/web/src/pages/Room/editing/activeLayer.test.ts), [roomStorage.test.ts](../../../apps/web/src/lib/browser/roomStorage.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#506 (CLOSED, закрыта 2026-08-25)](https://github.com/SuselMan/art_lessons/issues/506). Статус нового запуска: NOT RUN.

<a id="qa-560"></a>

## QA-560 — Copy/merge мокрого canonical target

**Начало и участники:** M70 слои ещё анимируются; тот же журнал у peer.

**Действия:** Дублировать/merge до завершения morph, потом Dry/replay; actual снять до oracle.

**Ожидание:** Копируется стабильный target, а не случайный кадр анимации; GPU gate нуждается в M70 кандидате.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Дополнительные регрессии:** [pinned локальный источник](sources.md#night), `apps/web/src/engine/index.layerDuplicate.test.ts`. Это unit-контроль версии кандидата; запуск только в соответствующей копии, GPU acceptance остаётся ручным.

**Источники/дефекты:** [#749 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/749). Статус нового запуска: NOT RUN.

<a id="qa-561"></a>

## QA-561 — Историческая копия после позднего Undo source

**Начало и участники:** А скопировал слой; Б позже отменяет ранний source stroke.

**Действия:** Доставить поздний Undo в server order и повторить полный replay копии.

**Ожидание:** Старый copy зафиксирован на своей исторической границе, не переосмыслен по текущему source.

**Автоматизация:** частичные unit-контракты [index.layerDuplicate.test.ts](../../../apps/web/src/engine/index.layerDuplicate.test.ts), [index.trueOrder.test.ts](../../../apps/web/src/engine/index.trueOrder.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Дополнительные регрессии:** [pinned локальный источник](sources.md#night), `apps/web/src/engine/index.historicalCopy.test.ts`. Это unit-контроль версии кандидата; запуск только в соответствующей копии, GPU acceptance остаётся ручным.

**Источники/дефекты:** [#750 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/750). Статус нового запуска: NOT RUN.

<a id="qa-562"></a>

## QA-562 — Историческая копия и новый source snapshot

**Начало и участники:** Есть копия на seqN и новый source snapshot послеN.

**Действия:** Перезайти, восстановить копию, получить более поздний snapshot оригинала.

**Ожидание:** Replay копии не использует будущую базу source; граница seq соблюдена.

**Автоматизация:** частичные unit-контракты [snapshotHistoryRepair.test.ts](../../../apps/web/src/pages/Room/net/snapshotHistoryRepair.test.ts), [index.layerDuplicate.test.ts](../../../apps/web/src/engine/index.layerDuplicate.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Дополнительные регрессии:** [pinned локальный источник](sources.md#night), `apps/web/src/engine/index.historicalCopy.test.ts`. Это unit-контроль версии кандидата; запуск только в соответствующей копии, GPU acceptance остаётся ручным.

**Источники/дефекты:** [#751 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/751). Статус нового запуска: NOT RUN.

<a id="qa-563"></a>

## QA-563 — Undo merge мокрых источников

**Начало и участники:** Два мокрых M70 слоя, два автора, canonical capture до oracle.

**Действия:** Merge, Undo merge, продолжить водой на восстановленных слоях; rejoin.

**Ожидание:** Живые source и их материал восстановлены согласованно, не только совпадают независимые replay; acceptance на M70 вручную.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Дополнительные регрессии:** [pinned локальный источник](sources.md#night), `apps/web/src/engine/index.structuralUndo.test.ts`. Это unit-контроль версии кандидата; запуск только в соответствующей копии, GPU acceptance остаётся ручным.

**Источники/дефекты:** [#754 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/754). Статус нового запуска: NOT RUN.

## Материалы и преобразования

<a id="qa-453"></a>

## QA-453 — Смена цвета не перекрашивает прошлое

**Начало и участники:** Графит на двух слоях, цвета различимы.

**Действия:** Рисовать красным, сменить на синий и продолжить; Undo/Redo и replay.

**Ожидание:** Прежний штрих остаётся красным, новый синий во всех режимах.

**Автоматизация:** частичные unit-контракты [index.trueOrder.test.ts](../../../apps/web/src/engine/index.trueOrder.test.ts), [index.networkedUndoRedo.test.ts](../../../apps/web/src/engine/index.networkedUndoRedo.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#117 (CLOSED, закрыта 2026-07-05)](https://github.com/SuselMan/art_lessons/issues/117). Статус нового запуска: NOT RUN.

<a id="qa-454"></a>

## QA-454 — Острый угол быстрого штриха

**Начало и участники:** Реальные Samsung и Surface, одинаковый материал.

**Действия:** Рисовать быстрый зигзаг и медленную плавную дугу; записать входные точки.

**Ожидание:** Угол не превращён в дугу сглаживанием; гладкий участок не получает ломаного шума.

**Автоматизация:** частичные unit-контракты [DabSystem.test.ts](../../../apps/web/src/engine/src/dabs/DabSystem.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#91 (CLOSED, закрыта 2026-07-08)](https://github.com/SuselMan/art_lessons/issues/91). Статус нового запуска: NOT RUN.

<a id="qa-455"></a>

## QA-455 — Плотность не зависит от report rate

**Начало и участники:** Один сохранённый путь с разной частотой/субпиксельными точками.

**Действия:** Нарисовать один путь плотными и редкими отчётами с одинаковым временем/нажимом.

**Ожидание:** Депозит и форма не зависят произвольно от частоты отчётов; сохранены субпиксельные участки.

**Автоматизация:** частичные unit-контракты [index.dabSpacing.test.ts](../../../apps/web/src/engine/index.dabSpacing.test.ts), [DabSystem.test.ts](../../../apps/web/src/engine/src/dabs/DabSystem.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#303 (CLOSED, закрыта 2026-07-30)](https://github.com/SuselMan/art_lessons/issues/303). Статус нового запуска: NOT RUN.

<a id="qa-456"></a>

## QA-456 — Скорость по timestamp пера

**Начало и участники:** Coalesced samples; обработчик намеренно задержан.

**Действия:** Подать одинаковые timestamps с быстрым/медленным обработчиком; проверить liner/brushPen.

**Ожидание:** Физика скорости одинакова; очередь обработчика не даёт зебру и пропажу чернил.

**Автоматизация:** частичные unit-контракты [PointerInput.speed.test.ts](../../../apps/web/src/engine/src/input/PointerInput.speed.test.ts), [index.liner.test.ts](../../../apps/web/src/engine/index.liner.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#532 (CLOSED, закрыта 2026-09-05)](https://github.com/SuselMan/art_lessons/issues/532). Статус нового запуска: NOT RUN.

<a id="qa-457"></a>

## QA-457 — Прерывания длинного жеста на zoom

**Начало и участники:** Планшет, крупный zoom, длинный stroke.

**Действия:** Писать непрерывно, пересечь границу видимой области и продолжать до UP.

**Ожидание:** Нет случайных разрывов, все принятые части видны после replay.

**Автоматизация:** частичные unit-контракты [index.strokeStreaming.test.ts](../../../apps/web/src/engine/index.strokeStreaming.test.ts), [index.strokeChunking.test.ts](../../../apps/web/src/engine/index.strokeChunking.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#187 (CLOSED, закрыта 2026-08-04)](https://github.com/SuselMan/art_lessons/issues/187), [#205 (CLOSED, закрыта 2026-07-19)](https://github.com/SuselMan/art_lessons/issues/205). Статус нового запуска: NOT RUN.

<a id="qa-458"></a>

## QA-458 — Наклон пера и азимут хвата

**Начало и участники:** Перьевые образцы с одинаковой физической величиной tilt и разным azimuth.

**Действия:** Нарисовать эквивалентные штрихи, затем изменить именно tilt.

**Ожидание:** Величина наклона не зависит ошибочно от hypot компонент/азимута; форма меняется только по предназначенным параметрам.

**Автоматизация:** частичные unit-контракты [index.pencilTilt.test.ts](../../../apps/web/src/engine/index.pencilTilt.test.ts), [tiltMath.test.ts](../../../apps/web/src/engine/src/presets/tiltMath.test.ts), [pencilTilt.test.ts](../../../apps/web/src/engine/src/presets/pencilTilt.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#163 (CLOSED, закрыта 2026-07-16)](https://github.com/SuselMan/art_lessons/issues/163), [#388 (CLOSED, закрыта 2026-08-06)](https://github.com/SuselMan/art_lessons/issues/388). Статус нового запуска: NOT RUN.

<a id="qa-459"></a>

## QA-459 — Крупный твёрдый карандаш

**Начало и участники:** Материалы 2H–6H, крупная кисть, обычная бумага.

**Действия:** Нарисовать длинную линию каждого грейда и повторить на мягких грейдах.

**Ожидание:** Нет отдельных эллипсов/фестонов; исправление твёрдого не делает мягкий край плоским и жёстким.

**Автоматизация:** частичные unit-контракты [pencilPresets.test.ts](../../../apps/web/src/engine/src/presets/pencilPresets.test.ts), [index.dabSpacing.test.ts](../../../apps/web/src/engine/index.dabSpacing.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#478 (CLOSED, закрыта 2026-08-21)](https://github.com/SuselMan/art_lessons/issues/478), [#483 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/483), [#485 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/485). Статус нового запуска: NOT RUN.

<a id="qa-460"></a>

## QA-460 — Равномерный маркер внутри жеста

**Начало и участники:** Bullet и chisel, крупный размер и полупрозрачный seed.

**Действия:** Одним жестом пересечь свои dabs, повторить вторым отдельным жестом.

**Ожидание:** Внутри первого нет полос/шевронов и прямоугольных dab; перекрытие разных жестов работает согласно материалу.

**Автоматизация:** частичные unit-контракты [index.marker.test.ts](../../../apps/web/src/engine/index.marker.test.ts), [markerRibbon.test.ts](../../../apps/web/src/engine/src/dabs/markerRibbon.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#266 (CLOSED, закрыта 2026-07-22)](https://github.com/SuselMan/art_lessons/issues/266), [#330 (CLOSED, закрыта 2026-07-28)](https://github.com/SuselMan/art_lessons/issues/330). Статус нового запуска: NOT RUN.

<a id="qa-461"></a>

## QA-461 — Конец сегмента маркера

**Начало и участники:** Маркерная лента, углы и быстрый UP.

**Действия:** Сделать короткие угловые штрихи с разными последними сегментами.

**Ожидание:** Нет лишнего даба позади линии и прыжка на конце.

**Автоматизация:** частичные unit-контракты [markerRibbon.test.ts](../../../apps/web/src/engine/src/dabs/markerRibbon.test.ts), [index.marker.test.ts](../../../apps/web/src/engine/index.marker.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#361 (CLOSED, закрыта 2026-08-06)](https://github.com/SuselMan/art_lessons/issues/361). Статус нового запуска: NOT RUN.

<a id="qa-462"></a>

## QA-462 — Маркер не делает подложку непрозрачной

**Начало и участники:** Полупрозрачный штрих, прозрачный фон.

**Действия:** Провести маркером поверх и проверить alpha до/после Undo.

**Ожидание:** Непрозрачность не становится 1 из-за неверной premultiplied композиции.

**Автоматизация:** частичные unit-контракты [markerInkGain.test.ts](../../../apps/web/src/engine/src/dabs/markerInkGain.test.ts), [index.marker.test.ts](../../../apps/web/src/engine/index.marker.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#439 (CLOSED, закрыта 2026-08-11)](https://github.com/SuselMan/art_lessons/issues/439). Статус нового запуска: NOT RUN.

<a id="qa-463"></a>

## QA-463 — Стык чанков маркера

**Начало и участники:** Длинный реальный жест, chunk boundary проходит по заметному участку.

**Действия:** Удерживать до нескольких chunks, сравнить live/commit/replay и raw seam pixels.

**Ожидание:** Нет двойного multiply либо светлого разрыва на границе chunks.

**Автоматизация:** частичные unit-контракты [index.strokeChunking.test.ts](../../../apps/web/src/engine/index.strokeChunking.test.ts), [index.strokeStreaming.test.ts](../../../apps/web/src/engine/index.strokeStreaming.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#435 (CLOSED, закрыта 2026-08-11)](https://github.com/SuselMan/art_lessons/issues/435). Статус нового запуска: NOT RUN.

<a id="qa-464"></a>

## QA-464 — Растушёвка без белого ореола

**Начало и участники:** Тёмная линия на бумаге и отдельный цветной seed.

**Действия:** Растушевать вдоль края на разных размерах; Undo/Redo.

**Ожидание:** Цвет переносится растрово без белого ореола и ложного скалярного разбавления.

**Автоматизация:** частичные unit-контракты [index.smudge.test.ts](../../../apps/web/src/engine/index.smudge.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#416 (CLOSED, закрыта 2026-08-10)](https://github.com/SuselMan/art_lessons/issues/416), [#444 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/444). Статус нового запуска: NOT RUN.

<a id="qa-465"></a>

## QA-465 — Preview peer тем же материалом

**Начало и участники:** Два браузера, marker и smudge.

**Действия:** Держать длинный жест А, сравнить у Б до UP, после commit и replay.

**Ожидание:** Preview не подменяет маркер/растушёвку обычными dabs; нет скачка в другой рисунок при commit.

**Автоматизация:** частичные unit-контракты [index.peerLiveStroke.test.ts](../../../apps/web/src/engine/index.peerLiveStroke.test.ts), [index.tiledPreview.test.ts](../../../apps/web/src/engine/index.tiledPreview.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#430 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/430). Статус нового запуска: NOT RUN.

<a id="qa-466"></a>

## QA-466 — Переход импорта к следующей операции

**Начало и участники:** Большая картинка с искусственно задержанным decode.

**Действия:** Принять image_import, затем stroke/clear/transform, затем replay.

**Ожидание:** Последующие операции не теряются и не обгоняют асинхронный import.

**Автоматизация:** частичные unit-контракты [index.imageImport.test.ts](../../../apps/web/src/engine/index.imageImport.test.ts), [index.networkedUndoRedo.test.ts](../../../apps/web/src/engine/index.networkedUndoRedo.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#398 (CLOSED, закрыта 2026-08-06)](https://github.com/SuselMan/art_lessons/issues/398). Статус нового запуска: NOT RUN.

<a id="qa-467"></a>

## QA-467 — Undo импортированной картинки

**Начало и участники:** Свежий image_import на отдельном слое.

**Действия:** Undo, Redo и reload/peer check.

**Ожидание:** Undo убирает именно картинку, Redo возвращает; открытый 447 не считать исправленным без прогона.

**Автоматизация:** частичные unit-контракты [index.imageImport.test.ts](../../../apps/web/src/engine/index.imageImport.test.ts), [index.structuralUndo.test.ts](../../../apps/web/src/engine/index.structuralUndo.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#447 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/447). Статус нового запуска: NOT RUN.

<a id="qa-468"></a>

## QA-468 — Изображение за границей холста

**Начало и участники:** Импортированный референс пересекает границу листа.

**Действия:** Увести часть за край, подтвердить, вернуть, повторить после reload.

**Ожидание:** Контент вне текущего видимого листа не уничтожен необратимо; рамка/доступный extent согласованы.

**Автоматизация:** частичные unit-контракты [index.layerTransform.test.ts](../../../apps/web/src/engine/index.layerTransform.test.ts), [index.tiledTransform.test.ts](../../../apps/web/src/engine/index.tiledTransform.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#133 (CLOSED, закрыта 2026-07-13)](https://github.com/SuselMan/art_lessons/issues/133). Статус нового запуска: NOT RUN.

<a id="qa-469"></a>

## QA-469 — Размер и hit area gizmo

**Начало и участники:** Непустой слой, zoom10/100/400%.

**Действия:** Пытаться взять те же handles, несколько раз повернуть и масштабировать.

**Ожидание:** Hit area остаётся удобной в screen px; bounding box не растёт после каждого вращения.

**Автоматизация:** частичные unit-контракты [transformMath.test.ts](../../../apps/web/src/lib/transform/transformMath.test.ts), [index.layerTransform.test.ts](../../../apps/web/src/engine/index.layerTransform.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#394 (CLOSED, закрыта 2026-08-06)](https://github.com/SuselMan/art_lessons/issues/394), [#421 (CLOSED, закрыта 2026-08-10)](https://github.com/SuselMan/art_lessons/issues/421). Статус нового запуска: NOT RUN.

<a id="qa-470"></a>

## QA-470 — Второй жест transform-сессии

**Начало и участники:** Повернуть слой, не подтверждать сессию.

**Действия:** Выполнить второй drag, потом UP/commit и Undo.

**Ожидание:** Второй жест использует правильное пространство, gizmo не уезжает; слой не прыгает в исходник при UP.

**Автоматизация:** частичные unit-контракты [transformMath.test.ts](../../../apps/web/src/lib/transform/transformMath.test.ts), [index.tiledTransformPreview.test.ts](../../../apps/web/src/engine/index.tiledTransformPreview.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#395 (CLOSED, закрыта 2026-08-06)](https://github.com/SuselMan/art_lessons/issues/395), [#399 (CLOSED, закрыта 2026-08-06)](https://github.com/SuselMan/art_lessons/issues/399), [#407 (CLOSED, закрыта 2026-08-06)](https://github.com/SuselMan/art_lessons/issues/407). Статус нового запуска: NOT RUN.

<a id="qa-471"></a>

## QA-471 — Transform pending ACK и Esc

**Начало и участники:** Сессия трансформации отправлена, ACK задержан.

**Действия:** Нажать Esc до подтверждения, затем доставить ACK.

**Ожидание:** Удерживаемое preview не пропадает раньше confirmed результата; duplicate op нет.

**Автоматизация:** частичные unit-контракты [index.tiledTransformPreview.test.ts](../../../apps/web/src/engine/index.tiledTransformPreview.test.ts), [optimism.test.ts](../../../apps/web/src/pages/Room/net/optimism.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#417 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/417). Статус нового запуска: NOT RUN.

<a id="qa-472"></a>

## QA-472 — Transform reload и тап вне рамки

**Начало и участники:** Незакоммиченная сессия; minimal UI выключен.

**Действия:** Reload с открытым transform; отдельно тапнуть вне рамки пером и пальцем.

**Ожидание:** Сессия не теряется молча согласно сохранённой политике; тап подтверждает/закрывает её, не включает заодно minimal UI.

**Автоматизация:** частичные unit-контракты [reloadSafety.test.ts](../../../apps/web/src/lib/browser/reloadSafety.test.ts), [tapTracker.test.ts](../../../apps/web/src/pages/Room/gestures/tapTracker.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#401 (CLOSED, закрыта 2026-08-06)](https://github.com/SuselMan/art_lessons/issues/401), [#408 (CLOSED, закрыта 2026-08-10)](https://github.com/SuselMan/art_lessons/issues/408). Статус нового запуска: NOT RUN.

<a id="qa-545"></a>

## QA-545 — Задержка локальной линии

**Начало и участники:** Реальный стилус на Samsung/Surface/iPad, live metrics или видеозамер.

**Действия:** Быстро писать и менять направление, отдельно повторить predictPointer по доступным флагам.

**Ожидание:** Есть pen-to-local-ink измерение и active/tail frame gaps; prediction не объявлен лечением без замера, бюджет согласован заранее.

**Автоматизация:** частичные unit-контракты [liveLatency.test.ts](../../../apps/web/src/lib/observability/liveLatency.test.ts), [PointerInput.speed.test.ts](../../../apps/web/src/engine/src/input/PointerInput.speed.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#104 (CLOSED, закрыта 2026-07-05)](https://github.com/SuselMan/art_lessons/issues/104), [#155 (CLOSED, закрыта 2026-07-14)](https://github.com/SuselMan/art_lessons/issues/155). Статус нового запуска: NOT RUN.

<a id="qa-546"></a>

## QA-546 — Видимая стоимость обычного Undo

**Начало и участники:** Обычная длинная pencil/marker комната, не M70 benchmark.

**Действия:** Сделать Undo при открытом редакторе и одновременном peer input; измерить до видимого кадра.

**Ожидание:** UI не остаётся заблокированным без диагностики; фактическое время и кадры сравнены с принятым бюджетом, не только время resolver.

**Автоматизация:** частичные unit-контракты [index.replayCost.test.ts](../../../apps/web/src/engine/index.replayCost.test.ts), [index.structuralUndoRedoPeek.test.ts](../../../apps/web/src/engine/index.structuralUndoRedoPeek.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#308 (CLOSED, закрыта 2026-08-04)](https://github.com/SuselMan/art_lessons/issues/308). Статус нового запуска: NOT RUN.

<a id="qa-548"></a>

## QA-548 — Нажим акварели и brushPen

**Начало и участники:** Физическое перо, одинаковые скачки pressure и размеры.

**Действия:** Нанести weak→strong→weak brushPen и watercolor при тех же входах; сравнить ширину/replay.

**Ожидание:** Гибкая кисть имеет тонкий контакт независимо от размера; заявленное сглаживание pressure не действует обратным образом.

**Автоматизация:** частичные unit-контракты [index.ribbonPressure.test.ts](../../../apps/web/src/engine/index.ribbonPressure.test.ts), [flexibleHairline.test.ts](../../../apps/web/src/engine/src/dabs/flexibleHairline.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#473 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/473), [#684 (CLOSED, закрыта 2026-10-01)](https://github.com/SuselMan/art_lessons/issues/684). Статус нового запуска: NOT RUN.

<a id="qa-551"></a>

## QA-551 — Мелкий chisel без дыр

**Начало и участники:** Chisel8/15/20px, наклон 0/45/90° относительно хода.

**Действия:** Нарисовать ровную линию при 100% и снять сечение покрытия.

**Ожидание:** Внутри нет решётки/пунктира с шагом dabs; края/минимальное покрытие измерены.

**Автоматизация:** частичные unit-контракты [markerRibbon.test.ts](../../../apps/web/src/engine/src/dabs/markerRibbon.test.ts), [index.marker.test.ts](../../../apps/web/src/engine/index.marker.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#559 (CLOSED, закрыта 2026-09-23)](https://github.com/SuselMan/art_lessons/issues/559). Статус нового запуска: NOT RUN.

<a id="qa-552"></a>

## QA-552 — Chisel90° live против replay

**Начало и участники:** Один сохранённый chisel-жест поперёк хода, контроль bullet/45°.

**Действия:** Снять actual до Undo/Redo, затем rejoin; сравнить ROI.

**Ожидание:** Live и replay дают согласованный материал, разница не скрыта переносом координат/допуска.

**Автоматизация:** частичные unit-контракты [index.marker.test.ts](../../../apps/web/src/engine/index.marker.test.ts), [markerRibbon.test.ts](../../../apps/web/src/engine/src/dabs/markerRibbon.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#560 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/560). Статус нового запуска: NOT RUN.

<a id="qa-553"></a>

## QA-553 — Антиалиасинг края маркерной ленты

**Начало и участники:** Прямой chisel30/50 и bullet8+, крупный zoom.

**Действия:** Измерить крайний ряд pixels между stamp и ribbon в одном stroke.

**Ожидание:** Нет зубчатого чередования over вместо max; средний цвет не скрывает дефект края.

**Автоматизация:** частичные unit-контракты [markerRibbon.test.ts](../../../apps/web/src/engine/src/dabs/markerRibbon.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#561 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/561). Статус нового запуска: NOT RUN.

<a id="qa-557"></a>

## QA-557 — Компиляция шейдеров Adreno

**Начало и участники:** Реальный Samsung SM-T970/Adreno650, холодный browser shader cache.

**Действия:** Трижды холодно открыть shader paths включая carry/deposit/colour, затем нарисовать и replay; сравнить разрешённый A/B вход на GPU.

**Ожидание:** Нет compiler/link failure и потерянного контекста; все формулы дают прежние pixels в подтверждённых A/B вариантах.

**Автоматизация:** частичные unit-контракты [shaders.test.ts](../../../apps/web/src/engine/src/raster/shaders.test.ts), [webgl.test.ts](../../../apps/web/src/lib/browser/webgl.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#685 (CLOSED, закрыта 2026-10-01)](https://github.com/SuselMan/art_lessons/issues/685). Статус нового запуска: NOT RUN.

<a id="qa-564"></a>

## QA-564 — Новый ввод во время Dry другого слоя

**Начало и участники:** А инициировал Dry, Б начинает trusted stroke на том же/другом слое.

**Действия:** Сразу после ACK Dry рисовать обоими и дождаться окончания presentation drying.

**Ожидание:** Новый ввод не пропадает молча глобально; локальное ограничение либо очередь явно определены и проверены.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Дополнительные регрессии:** [pinned локальный источник](sources.md#night), `apps/web/src/engine/index.dryInput.test.ts`. Это unit-контроль версии кандидата; запуск только в соответствующей копии, GPU acceptance остаётся ручным.

**Источники/дефекты:** [#755 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/755). Статус нового запуска: NOT RUN.

<a id="qa-565"></a>

## QA-565 — Prewarm на неподдержанной геометрии

**Начало и участники:** Карандаш, прямоугольный/infinite room, M70 опционален.

**Действия:** Переключать активный слой и ждать deferred prewarm, продолжать pencil strokes.

**Ожидание:** Ограничение M70 не порождает background pageerror при обычном рисовании.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Дополнительные регрессии:** [pinned локальный источник](sources.md#night), `apps/web/src/engine/index.puddlePrewarm.test.ts`. Это unit-контроль версии кандидата; запуск только в соответствующей копии, GPU acceptance остаётся ручным.

**Источники/дефекты:** [#757 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/757). Статус нового запуска: NOT RUN.

<a id="qa-572"></a>

## QA-572 — Deferred Dry не переходит на соседний слой

**Начало и участники:** Мокрые L/K, А держит stroke наL, Б скрывает и отзывает созданиеL.

**Действия:** Отменить хвост А, затем наK обычный новый stroke/UP.

**Ожидание:** Старая команда dry-at-up очищена и не сушитK без записанной операции.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Дополнительные регрессии:** [pinned локальный источник](sources.md#night), `apps/web/src/engine/index.dryInput.test.ts`. Это unit-контроль версии кандидата; запуск только в соответствующей копии, GPU acceptance остаётся ручным.

**Источники/дефекты:** [#772 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/772). Статус нового запуска: NOT RUN.

## Бумага и совместимость

<a id="qa-473"></a>

## QA-473 — Зерно world-space на infinite

**Начало и участники:** Один stroke через несколько тайлов, окно можно менять.

**Действия:** Pan/zoom/resize и смена orientation, затем сравнить бумагу под тем же мировым участком.

**Ожидание:** Бумага не плавает с экраном и не перезапускает узор отдельно на каждом тайле.

**Автоматизация:** частичные unit-контракты [index.paperTexture.test.ts](../../../apps/web/src/engine/index.paperTexture.test.ts), [index.tiledDisplay.test.ts](../../../apps/web/src/engine/index.tiledDisplay.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#141 (CLOSED, закрыта 2026-07-13)](https://github.com/SuselMan/art_lessons/issues/141), [#154 (CLOSED, закрыта 2026-07-30)](https://github.com/SuselMan/art_lessons/issues/154). Статус нового запуска: NOT RUN.

<a id="qa-474"></a>

## QA-474 — Масштаб графита и бумаги

**Начало и участники:** Bounded и infinite, DPR1 и 2.

**Действия:** Провести штрих по заметному зерну, изменить zoom и вернуться 100%.

**Ожидание:** Графит и display читают один масштаб бумаги; нативный размер не умножен ошибочно на DPR.

**Автоматизация:** частичные unit-контракты [index.paperTexture.test.ts](../../../apps/web/src/engine/index.paperTexture.test.ts), [index.paperMipmaps.test.ts](../../../apps/web/src/engine/index.paperMipmaps.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#333 (CLOSED, закрыта 2026-07-28)](https://github.com/SuselMan/art_lessons/issues/333), [#154 (CLOSED, закрыта 2026-07-30)](https://github.com/SuselMan/art_lessons/issues/154). Статус нового запуска: NOT RUN.

<a id="qa-475"></a>

## QA-475 — Шов baked paper

**Начало и участники:** Новая чистая комната каждого типа бумаги.

**Действия:** Осмотреть весь лист и переход repeat в оригинальном масштабе и zoom.

**Ожидание:** Нет вертикального разрыва baked texture; исходные paper asset размеры/каналы корректны.

**Автоматизация:** частичные unit-контракты [paperAssets.test.ts](../../../apps/web/src/engine/src/paper/paperAssets.test.ts), [index.paperTexture.test.ts](../../../apps/web/src/engine/index.paperTexture.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#302 (CLOSED, закрыта 2026-07-28)](https://github.com/SuselMan/art_lessons/issues/302), [#165 (CLOSED, закрыта 2026-07-16)](https://github.com/SuselMan/art_lessons/issues/165). Статус нового запуска: NOT RUN.

<a id="qa-476"></a>

## QA-476 — Вид бумаги и качество на GPU

**Начало и участники:** Rough/Smooth/Bristol на AMD/Intel/Apple/Adreno.

**Действия:** Открыть одинаковый seed и параметры, сравнить paperCatch и общий relief.

**Ожидание:** Сохранены различия типов без чрезмерного рельефа; одинаковый baked источник, а не независимый шум каждого GPU.

**Автоматизация:** частичные unit-контракты [paperAssets.test.ts](../../../apps/web/src/engine/src/paper/paperAssets.test.ts), [index.paperTexture.test.ts](../../../apps/web/src/engine/index.paperTexture.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#95 (CLOSED, закрыта 2026-07-05)](https://github.com/SuselMan/art_lessons/issues/95), [#162 (CLOSED, закрыта 2026-07-16)](https://github.com/SuselMan/art_lessons/issues/162), [#165 (CLOSED, закрыта 2026-07-16)](https://github.com/SuselMan/art_lessons/issues/165). Статус нового запуска: NOT RUN.

<a id="qa-477"></a>

## QA-477 — Смена бумаги и загрузка кода

**Начало и участники:** Настоящий планшет с кешем предыдущего посещения.

**Действия:** Поменять допустимую бумагу/комнату после обновления ассетов, дождаться paperReady.

**Ожидание:** Нет ошибки загрузки Room chunk, новый тип доступен, preload не открывает редактор до готовности.

**Автоматизация:** частичные unit-контракты [paperLoader.test.ts](../../../apps/web/src/engine/src/paper/paperLoader.test.ts), [notOpenScreen.test.ts](../../../apps/web/src/pages/Room/status/notOpenScreen.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#186 (CLOSED, закрыта 2026-07-19)](https://github.com/SuselMan/art_lessons/issues/186), [#345 (CLOSED, закрыта 2026-07-29)](https://github.com/SuselMan/art_lessons/issues/345), [#350 (CLOSED, закрыта 2026-07-29)](https://github.com/SuselMan/art_lessons/issues/350). Статус нового запуска: NOT RUN.

<a id="qa-478"></a>

## QA-478 — Safari совместимость бумаги

**Начало и участники:** iPad Safari16.3 либо заявленный минимум; WebGL1.

**Действия:** Создать комнату, загрузить paper blob и пройти в редактор.

**Ожидание:** Поддержанный браузер читает baked формат; если версия больше не поддержана, зафиксировано явное требование, а не молчаливый пустой холст.

**Автоматизация:** частичные unit-контракты [paperLoader.test.ts](../../../apps/web/src/engine/src/paper/paperLoader.test.ts), [webgl.test.ts](../../../apps/web/src/lib/browser/webgl.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#464 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/464). Статус нового запуска: NOT RUN.

## Сохранение и восстановление

<a id="qa-479"></a>

## QA-479 — Снимок плюс Undo не стирают прошлое

**Начало и участники:** Слой восстановлен из snapshot, старые strokes вне локального окна.

**Действия:** Добавить штрих, Undo/Redo/revoke разных авторов, затем reload.

**Ожидание:** Старый snapshotted контент остаётся базой, не стирается отменой нового.

**Автоматизация:** частичные unit-контракты [index.restoredBaseLayers.test.ts](../../../apps/web/src/engine/index.restoredBaseLayers.test.ts), [index.networkedUndoRedo.test.ts](../../../apps/web/src/engine/index.networkedUndoRedo.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#287 (CLOSED, закрыта 2026-07-25)](https://github.com/SuselMan/art_lessons/issues/287). Статус нового запуска: NOT RUN.

<a id="qa-480"></a>

## QA-480 — Слои вне окна server log

**Начало и участники:** Много слоёв; старый слой давно не менялся и его операции вне resident window.

**Действия:** Запечь снимок, выгрузить комнату из RAM, войти другим устройством.

**Ожидание:** Все live layers имеют контент/покрытие; старый слой не выпадает из snapshot structure.

**Автоматизация:** частичные unit-контракты [snapshotCoverage.test.ts](../../../apps/server/src/rooms/snapshotCoverage.test.ts), [roomSnapshots.test.ts](../../../apps/server/src/rooms/roomSnapshots.test.ts), [index.structuralSnapshot.test.ts](../../../apps/web/src/engine/index.structuralSnapshot.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#369 (CLOSED, закрыта 2026-08-06)](https://github.com/SuselMan/art_lessons/issues/369). Статус нового запуска: NOT RUN.

<a id="qa-481"></a>

## QA-481 — Снимок пустой структуры не затирает живую

**Начало и участники:** Непустая комната с задержанным hydrate у нового клиента.

**Действия:** Пока join не завершён, спровоцировать bake/upload; затем завершить и повторить.

**Ожидание:** До полной структуры опасный upload запрещён, server отвергает snapshot, стирающий живые слои.

**Автоматизация:** частичные unit-контракты [snapshotRoutes.test.ts](../../../apps/server/src/roomRoutes/snapshotRoutes.test.ts), [structuralSnapshotBase.test.ts](../../../apps/web/src/pages/Room/net/structuralSnapshotBase.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#462 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/462). Статус нового запуска: NOT RUN.

<a id="qa-482"></a>

## QA-482 — Ошибка восстановления тайла видна

**Начало и участники:** Multi-tile snapshot с одним повреждённым/непрочитанным tile.

**Действия:** Открыть, потерять один blob/decoded tile, затем retry.

**Ожидание:** Нет молчаливого частичного успеха; ошибка наблюдаема и повтор может вернуть все тайлы.

**Автоматизация:** частичные unit-контракты [index.networkSnapshot.test.ts](../../../apps/web/src/engine/index.networkSnapshot.test.ts), [retileSnapshot.test.ts](../../../apps/web/src/engine/src/buffers/retileSnapshot.test.ts), [restoreReport.test.ts](../../../apps/web/src/pages/Room/diagnostics/restoreReport.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#474 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/474). Статус нового запуска: NOT RUN.

<a id="qa-483"></a>

## QA-483 — Нижняя полоса clipped snapshot

**Начало и участники:** Bounded лист с частичным последним тайлом, рисунок внизу.

**Действия:** Bake/restore при DPR/размере, отличном от stored tile geometry.

**Ожидание:** Нижняя полоса и крайние pixels сохранены; размеры/offset не путаются.

**Автоматизация:** частичные unit-контракты [retileSnapshot.clipped.test.ts](../../../apps/web/src/engine/src/buffers/retileSnapshot.clipped.test.ts), [AccumulationBuffer.clippedRestore.test.ts](../../../apps/web/src/engine/src/buffers/AccumulationBuffer.clippedRestore.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#500 (CLOSED, закрыта 2026-08-25)](https://github.com/SuselMan/art_lessons/issues/500). Статус нового запуска: NOT RUN.

<a id="qa-484"></a>

## QA-484 — Первый слой после restore

**Начало и участники:** Комната с persisted structure и первоначальным layer_add.

**Действия:** Restore/revoke старого initial layer, затем рисовать до bake threshold.

**Ожидание:** Начальный слой согласован, bake не заблокирован навсегда из-за потерянного revoke.

**Автоматизация:** частичные unit-контракты [structuralSnapshotBase.test.ts](../../../apps/web/src/pages/Room/net/structuralSnapshotBase.test.ts), [index.structuralSnapshot.test.ts](../../../apps/web/src/engine/index.structuralSnapshot.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#486 (CLOSED, закрыта 2026-08-24)](https://github.com/SuselMan/art_lessons/issues/486). Статус нового запуска: NOT RUN.

<a id="qa-485"></a>

## QA-485 — Потерянный commit seq не глушит bake

**Начало и участники:** Pending operation с задержанным/повторным подтверждением, peer продолжает.

**Действия:** Сделать reconnect/catchup, удалить устаревший pending, дождаться нового checkpoint.

**Ожидание:** Список pendingCommitSeqs отражает реальность, snapshot снова публикуется, watcher сообщает отставание.

**Автоматизация:** частичные unit-контракты [snapshotSync.test.ts](../../../apps/web/src/pages/Room/net/snapshotSync.test.ts), [snapshotLagWatch.test.ts](../../../apps/server/src/health/snapshotLagWatch.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#477 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/477), [#480 (CLOSED, закрыта 2026-08-24)](https://github.com/SuselMan/art_lessons/issues/480). Статус нового запуска: NOT RUN.

<a id="qa-486"></a>

## QA-486 — Пустой bake допускает повтор

**Начало и участники:** Новая комната без снимка, первый bake пришёл слишком рано/пустой.

**Действия:** Закончить hydrate, рисовать до следующего порога, дождаться bake.

**Ожидание:** Пустая первая попытка не запирает снимки навсегда; есть последующее корректное покрытие.

**Автоматизация:** частичные unit-контракты [index.emptySnapshotRetry.test.ts](../../../apps/web/src/engine/index.emptySnapshotRetry.test.ts), [firstSnapshotPolicy.test.ts](../../../apps/server/src/rooms/firstSnapshotPolicy.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#386 (CLOSED, закрыта 2026-08-04)](https://github.com/SuselMan/art_lessons/issues/386). Статус нового запуска: NOT RUN.

<a id="qa-487"></a>

## QA-487 — Checkpoint без незаписанных чернил

**Начало и участники:** Есть optimistic/live ink поверх подтверждённой базы.

**Действия:** Снять checkpoint, подтвердить/отменить исходную операцию, несколько раз Undo/Redo.

**Ожидание:** Незаписанные pixels не попали в базу дважды, насыщение не растёт на каждой отмене.

**Автоматизация:** частичные unit-контракты [index.checkpointUnrecordedInk.test.ts](../../../apps/web/src/engine/index.checkpointUnrecordedInk.test.ts), [checkpointPrefix.test.ts](../../../apps/web/src/engine/checkpointPrefix.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#479 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/479). Статус нового запуска: NOT RUN.

<a id="qa-488"></a>

## QA-488 — План восстановления без полной истории

**Начало и участники:** Тяжёлая комната, snapshots на разных seq, часть coverage несопоставима.

**Действия:** Получить replay plan, загрузить только dependency history и хвост; reconnect во время загрузки.

**Ожидание:** Снимки и tail доказуемо согласованы, covered payload не скачивается без нужды, retry не падает 403 навсегда.

**Автоматизация:** частичные unit-контракты [snapshotReplayPlan.test.ts](../../../apps/server/src/rooms/snapshotReplayPlan.test.ts), [snapshotReplayLoader.test.ts](../../../apps/server/src/rooms/snapshotReplayLoader.test.ts), [snapshotHistoryRepair.test.ts](../../../apps/web/src/pages/Room/net/snapshotHistoryRepair.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#291 (CLOSED, закрыта 2026-07-27)](https://github.com/SuselMan/art_lessons/issues/291), [#739 (CLOSED, закрыта 2026-10-09)](https://github.com/SuselMan/art_lessons/issues/739). Статус нового запуска: NOT RUN.

<a id="qa-489"></a>

## QA-489 — Сжатый blob и ETag

**Начало и участники:** Сервер хранит gzip snapshot; авторизованный клиент.

**Действия:** GET plan/blob, conditional GET, неверный seq, history cursor на границе.

**Ожидание:** Gzip байты переданы без повторного content-encoding,304 без body; seq/cursor валидированы, чужой доступ отказан.

**Автоматизация:** частичные unit-контракты [snapshotRoutes.test.ts](../../../apps/server/src/roomRoutes/snapshotRoutes.test.ts), [rest.test.ts](../../../packages/shared/src/rest.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#168 (CLOSED, закрыта 2026-07-19)](https://github.com/SuselMan/art_lessons/issues/168), [#342 (CLOSED, закрыта 2026-07-29)](https://github.com/SuselMan/art_lessons/issues/342), [#741 (CLOSED, закрыта 2026-10-09)](https://github.com/SuselMan/art_lessons/issues/741). Статус нового запуска: NOT RUN.

<a id="qa-490"></a>

## QA-490 — Сверка независимых снимков

**Начало и участники:** Два устройства запекают один seq с одинаковым журналом.

**Действия:** Принять первый snapshot, второй с тем же room/layer/seq и отличающимися bytes; проверить сохранность истории.

**Ожидание:** Сопоставление/dedup не признаёт непроверенную картинку доказательством для удаления исходной истории; расхождение диагностировано.

**Автоматизация:** частичные unit-контракты [roomSnapshots.test.ts](../../../apps/server/src/rooms/roomSnapshots.test.ts), [snapshotCoverage.test.ts](../../../apps/server/src/rooms/snapshotCoverage.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#168 (CLOSED, закрыта 2026-07-19)](https://github.com/SuselMan/art_lessons/issues/168), [#289 (CLOSED, закрыта 2026-07-25)](https://github.com/SuselMan/art_lessons/issues/289). Статус нового запуска: NOT RUN.

<a id="qa-547"></a>

## QA-547 — Время входа legacy комнаты

**Начало и участники:** Комнаты с snapshot и без,100/1000 обычных strokes.

**Действия:** Холодно войти с реального планшета; разделить network/decode/replay/Undo setup/first visible.

**Ожидание:** Отдельно известны время открытия, объём и блокировки; нет автоматического полного replay/скачивания старой истории без зависимости.

**Автоматизация:** частичные unit-контракты [openTiming.test.ts](../../../apps/web/src/pages/Room/diagnostics/openTiming.test.ts), [snapshotReplayLoader.test.ts](../../../apps/server/src/rooms/snapshotReplayLoader.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#381 (CLOSED, закрыта 2026-08-04)](https://github.com/SuselMan/art_lessons/issues/381), [#425 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/425). Статус нового запуска: NOT RUN.

<a id="qa-550"></a>

## QA-550 — Текст причины восстановления

**Начало и участники:** Управляемый snapshot decode/read error с известным message.

**Действия:** Открыть комнату и получить restore report/Sentry event.

**Ожидание:** Есть исходный текст/стадия/stack безопасной ошибки, не только общий failed; отсутствие report не выдаётся за отсутствие сбоя.

**Автоматизация:** частичные unit-контракты [restoreReport.test.ts](../../../apps/web/src/pages/Room/diagnostics/restoreReport.test.ts), [reportInvariant.test.ts](../../../apps/web/src/lib/observability/reportInvariant.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#534 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/534). Статус нового запуска: NOT RUN.

<a id="qa-556"></a>

## QA-556 — Количество операций после rejoin

**Начало и участники:** 100pencil strokes, snapshot seq100, хвост 3charcoal+3long pencil со chunks.

**Действия:** Сохранить IDs/effective actions и pixels до reload, затем после; отдельный контроль подсчёта chunks.

**Ожидание:** Любая разница count объяснена идентификаторами/семантикой, содержимое и accepted порядок не потеряны;673 не закрывается одним screenshot.

**Автоматизация:** частичные unit-контракты [snapshotHistoryRepair.test.ts](../../../apps/web/src/pages/Room/net/snapshotHistoryRepair.test.ts), [index.strokeChunking.test.ts](../../../apps/web/src/engine/index.strokeChunking.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#673 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/673). Статус нового запуска: NOT RUN.

<a id="qa-559"></a>

## QA-559 — Поздняя structural dependency snapshot

**Начало и участники:** Snapshot plan открывает новую структурную зависимость после первой страницы history.

**Действия:** Догрузить dependency history несколькими страницами, где поздно появляется copy/merge source.

**Ожидание:** Проверка prefix повторена после новых зависимостей, не только перед циклом; неполная база не применяется.

**Автоматизация:** частичные unit-контракты [snapshotHistoryRepair.test.ts](../../../apps/web/src/pages/Room/net/snapshotHistoryRepair.test.ts), [snapshotReplayPlan.test.ts](../../../apps/server/src/rooms/snapshotReplayPlan.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Дополнительные регрессии:** [pinned локальный источник](sources.md#night), `apps/web/src/pages/Room/net/snapshotHistoryRepair.test.ts`. Это unit-контроль версии кандидата; запуск только в соответствующей копии, GPU acceptance остаётся ручным.

**Источники/дефекты:** [#746 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/746). Статус нового запуска: NOT RUN.

<a id="qa-568"></a>

## QA-568 — Пустой M70 prewarm не блокирует bake

**Начало и участники:** Слой выбран, M70 готов, ни воды ни strokes на нём нет.

**Действия:** Подождать 51 мс после setActiveLayer, проверить quiet/checkpoint/bake; затем реальный stroke.

**Ожидание:** Пустой prewarm не считается незавершённым материалом и не запрещает snapshots навсегда.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Дополнительные регрессии:** [pinned локальный источник](sources.md#night), `apps/web/src/engine/index.puddlePrewarm.test.ts`. Это unit-контроль версии кандидата; запуск только в соответствующей копии, GPU acceptance остаётся ручным.

**Источники/дефекты:** [#765 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/765). Статус нового запуска: NOT RUN.

<a id="qa-570"></a>

## QA-570 — Новый snapshot заменяет старую мокрую базу

**Начало и участники:** M70 мокрый source уже resident, пришёл более новый bitmap+coverage.

**Действия:** Restore snapshot, затем recorded Dry, поздний ACK и pending local strokes.

**Ожидание:** Старая лужа не переписывает новую базу; pending не потерян, serverSeq coverage учтён.

**Автоматизация:** частичные unit-контракты [index.snapshotCoverage.test.ts](../../../apps/web/src/engine/index.snapshotCoverage.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Дополнительные регрессии:** [pinned локальный источник](sources.md#night), `apps/web/src/engine/index.wetSnapshot.test.ts`. Это unit-контроль версии кандидата; запуск только в соответствующей копии, GPU acceptance остаётся ручным.

**Источники/дефекты:** [#767 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/767). Статус нового запуска: NOT RUN.

## Сеть и очередь операций

<a id="qa-491"></a>

## QA-491 — Outbox работает без IndexedDB

**Начало и участники:** Браузер с отказом open/put/get IndexedDB, peer онлайн.

**Действия:** Рисовать и восстановить доступ к storage в этой же странице.

**Ожидание:** Операция не теряется молча; доступен memory fallback и отправка; rejected dbPromise не ломает всю жизнь страницы.

**Автоматизация:** частичные unit-контракты [outbox.test.ts](../../../apps/web/src/pages/Room/net/outbox.test.ts), [roomStorage.test.ts](../../../apps/web/src/lib/browser/roomStorage.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#296 (CLOSED, закрыта 2026-07-26)](https://github.com/SuselMan/art_lessons/issues/296). Статус нового запуска: NOT RUN.

<a id="qa-492"></a>

## QA-492 — Outbox привязан к комнате

**Начало и участники:** А офлайн нарисовал в комнате X; другая комната Y открывается тем же приложением.

**Действия:** Перейти в Y, вернуть сеть и reload обеих комнат.

**Ожидание:** Очередь X не отправлена в Y; операции восстановлены только в своей комнате.

**Автоматизация:** частичные unit-контракты [outbox.test.ts](../../../apps/web/src/pages/Room/net/outbox.test.ts), [deferredOps.test.ts](../../../apps/web/src/pages/Room/net/deferredOps.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#358 (CLOSED, закрыта 2026-07-30)](https://github.com/SuselMan/art_lessons/issues/358). Статус нового запуска: NOT RUN.

<a id="qa-493"></a>

## QA-493 — Операция до join получает ответ

**Начало и участники:** Socket подключён, join ещё не принят.

**Действия:** Отправить operation, затем завершить join и повторить по политике outbox.

**Ожидание:** Есть terminal/retryable ACK, нет бесконечных молчаливых retries и роста очереди.

**Автоматизация:** частичные unit-контракты [socketHandlers.test.ts](../../../apps/server/src/rooms/socketHandlers.test.ts), [outboxVerdict.test.ts](../../../apps/web/src/pages/Room/net/outboxVerdict.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#298 (CLOSED, закрыта 2026-07-26)](https://github.com/SuselMan/art_lessons/issues/298). Статус нового запуска: NOT RUN.

<a id="qa-494"></a>

## QA-494 — Исключение при operation ACK

**Начало и участники:** Подготовленный fault injection в handler/recordOperation.

**Действия:** Вызвать ошибку принятия операции, затем отправить допустимую.

**Ожидание:** Процесс жив, клиент получает отрицательный ACK с причиной, дальнейшие операции работают.

**Автоматизация:** частичные unit-контракты [socketHandlers.test.ts](../../../apps/server/src/rooms/socketHandlers.test.ts), [roomPersistence.test.ts](../../../apps/server/src/rooms/roomPersistence.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#164 (CLOSED, закрыта 2026-07-19)](https://github.com/SuselMan/art_lessons/issues/164), [#495 (CLOSED, закрыта 2026-08-24)](https://github.com/SuselMan/art_lessons/issues/495). Статус нового запуска: NOT RUN.

<a id="qa-495"></a>

## QA-495 — Повторная доставка и server seq

**Начало и участники:** Один operation id, duplicate transports/повторный reconnect.

**Действия:** Доставить duplicate, ACK в другом порядке и пропущенный seq, затем catchup.

**Ожидание:** Одна запись и один commit; confirmed stream восстанавливает порядок, чужой duplicate не меняет payload.

**Автоматизация:** частичные unit-контракты [confirmedStream.test.ts](../../../apps/web/src/pages/Room/net/confirmedStream.test.ts), [rooms.test.ts](../../../apps/server/src/rooms/rooms.test.ts), [OperationLog.test.ts](../../../apps/web/src/engine/src/oplog/OperationLog.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#205 (CLOSED, закрыта 2026-07-19)](https://github.com/SuselMan/art_lessons/issues/205), [#537 (CLOSED, закрыта 2026-09-28)](https://github.com/SuselMan/art_lessons/issues/537). Статус нового запуска: NOT RUN.

<a id="qa-496"></a>

## QA-496 — Permanent и retryable reject

**Начало и участники:** Очередь с room_frozen/target_gone и временной сетевой ошибкой.

**Действия:** Отправить, получить разные причины, вернуть доступ/сеть.

**Ожидание:** Временный отказ повторяется, постоянный явно разрешён/восстановлен, pending не зависает навсегда.

**Автоматизация:** частичные unit-контракты [outboxVerdict.test.ts](../../../apps/web/src/pages/Room/net/outboxVerdict.test.ts), [lostWork.test.ts](../../../apps/web/src/pages/Room/net/lostWork.test.ts), [rejectReason.test.ts](../../../packages/shared/src/rejectReason.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#311 (CLOSED, закрыта 2026-07-28)](https://github.com/SuselMan/art_lessons/issues/311), [#693 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/693). Статус нового запуска: NOT RUN.

<a id="qa-497"></a>

## QA-497 — Автовозврат после shutdown

**Начало и участники:** Изолированный QA backend и открытый редактор с сохранённым input.

**Действия:** Контролируемо завершить свой backend SIGTERM, запустить его, дождаться reconnect; не трогать production.

**Ожидание:** Socket трактует shutdown как обрыв и возвращается сам, outbox дослан, баннер связи снят без reload.

**Автоматизация:** частичные unit-контракты [shutdown.test.ts](../../../apps/server/src/health/shutdown.test.ts), [socketRevival.test.ts](../../../apps/web/src/pages/Room/net/socketRevival.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#497 (CLOSED, закрыта 2026-08-24)](https://github.com/SuselMan/art_lessons/issues/497), [#504 (CLOSED, закрыта 2026-08-25)](https://github.com/SuselMan/art_lessons/issues/504). Статус нового запуска: NOT RUN.

<a id="qa-498"></a>

## QA-498 — Ошибка create/join видна человеку

**Начало и участники:** Изолированный API возвращает not_found/forbidden/internal error.

**Действия:** Создать/войти через UI, повторить после исправления сервера.

**Ожидание:** Понятный отказ и retry, не только console error; engine не остаётся полуинициализированным.

**Автоматизация:** частичные unit-контракты [joinError.test.ts](../../../apps/web/src/pages/Room/net/joinError.test.ts), [notOpenScreen.test.ts](../../../apps/web/src/pages/Room/status/notOpenScreen.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#496 (CLOSED, закрыта 2026-08-24)](https://github.com/SuselMan/art_lessons/issues/496), [#538 (CLOSED, закрыта 2026-09-05)](https://github.com/SuselMan/art_lessons/issues/538). Статус нового запуска: NOT RUN.

<a id="qa-499"></a>

## QA-499 — Неправильная целевая структура

**Начало и участники:** Серверный слой удалён либо закрыт, клиент сохранил старый ID.

**Действия:** Доставить stroke/image_import/layer_clear/transform в устаревшую цель.

**Ожидание:** OperationGate явно отвергает недопустимую цель; нет принято-но-потеряно, отказ до replay loop.

**Автоматизация:** частичные unit-контракты [operationGate.test.ts](../../../apps/server/src/rooms/operationGate.test.ts), [structuralLog.test.ts](../../../apps/server/src/rooms/structuralLog.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#311 (CLOSED, закрыта 2026-07-28)](https://github.com/SuselMan/art_lessons/issues/311), [#451 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/451). Статус нового запуска: NOT RUN.

<a id="qa-500"></a>

## QA-500 — HTTP catchup пока socket отсутствует

**Начало и участники:** Участник ранее допущен, socket временно потерян, история грузится.

**Действия:** Получить несколько страниц во время reconnect и после смены password/block.

**Ожидание:** Разрешённая история читается без случайного 403; настоящее revocation прекращает чтение и не ретраится бесконечно.

**Автоматизация:** частичные unit-контракты [catchUp.test.ts](../../../apps/web/src/pages/Room/net/catchUp.test.ts), [boardContentAccess.test.ts](../../../apps/server/src/rooms/boardContentAccess.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#739 (CLOSED, закрыта 2026-10-09)](https://github.com/SuselMan/art_lessons/issues/739), [#741 (CLOSED, закрыта 2026-10-09)](https://github.com/SuselMan/art_lessons/issues/741). Статус нового запуска: NOT RUN.

<a id="qa-566"></a>

## QA-566 — Refused live tail после обычного UP

**Начало и участники:** Student отправил live+normal UP и остаётся online; durable op будет отвергнут.

**Действия:** Freeze/удалить цель до operation commit, принять permanent rejection; наблюдать peer cancellation.

**Ожидание:** Незаписанный хвост удалён у наблюдателей даже после нормального UP; accepted части не удалены.

**Автоматизация:** частичные unit-контракты [socketHandlers.test.ts](../../../apps/server/src/rooms/socketHandlers.test.ts), [index.peerLiveStroke.test.ts](../../../apps/web/src/engine/index.peerLiveStroke.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Дополнительные регрессии:** [pinned локальный источник](sources.md#night), `apps/server/src/rooms/liveStrokeOwnership.test.ts`. Это unit-контроль версии кандидата; запуск только в соответствующей копии, GPU acceptance остаётся ручным.

**Источники/дефекты:** [#762 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/762). Статус нового запуска: NOT RUN.

<a id="qa-567"></a>

## QA-567 — Flush при неподвижном удержании пера

**Начало и участники:** Live интервал 60 мс; автор двигается быстрее интервала и останавливается до UP.

**Действия:** Нарисовать короткий быстрый сегмент, держать перо неподвижно, не слать новых pointer events.

**Ожидание:** Очередь live dabs flush по таймеру; peer получает хвост до UP, не только первый пакет.

**Автоматизация:** частичные unit-контракты [index.strokeStreaming.test.ts](../../../apps/web/src/engine/index.strokeStreaming.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Дополнительные регрессии:** [pinned локальный источник](sources.md#night), `apps/web/src/engine/index.strokeStreaming.test.ts`. Это unit-контроль версии кандидата; запуск только в соответствующей копии, GPU acceptance остаётся ручным.

**Источники/дефекты:** [#764 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/764). Статус нового запуска: NOT RUN.

<a id="qa-569"></a>

## QA-569 — Resize наблюдателя при held stroke

**Начало и участники:** Samsung observer, peer держит M70 перо, новых live packets пока нет.

**Действия:** Получить два live пакета, изменить viewport/ResizeObserver, ждать, потом UP.

**Ожидание:** Живой film не исчезает до UP, stream и экран остаются согласованы.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Дополнительные регрессии:** [pinned локальный источник](sources.md#night), `apps/web/src/engine/index.watercolorTransientPreview.test.ts`. Это unit-контроль версии кандидата; запуск только в соответствующей копии, GPU acceptance остаётся ручным.

**Источники/дефекты:** [#766 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/766). Статус нового запуска: NOT RUN.

## Тайлы, камера и память GPU

<a id="qa-501"></a>

## QA-501 — Дробный zoom на шве тайлов

**Начало и участники:** Рисунок через соседние тайлы, zoom1.01, дробный pan.

**Действия:** Двигать камеру и менять zoom около единицы.

**Ожидание:** Нет 1px прозрачного разрыва/нахлёста на общей границе.

**Автоматизация:** частичные unit-контракты [index.tiledDisplay.test.ts](../../../apps/web/src/engine/index.tiledDisplay.test.ts), [cameraFrame.test.ts](../../../apps/web/src/engine/src/raster/cameraFrame.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#140 (CLOSED, закрыта 2026-07-13)](https://github.com/SuselMan/art_lessons/issues/140). Статус нового запуска: NOT RUN.

<a id="qa-502"></a>

## QA-502 — Экспорт вне viewport

**Начало и участники:** Infinite рисунок далеко за камерой на нескольких тайлах.

**Действия:** Увести камеру, export PNG с бумагой/прозрачностью и pickColor в offscreen world point.

**Ожидание:** Экспорт содержит весь нужный рисунок, пипетка читает world pixels, не текущий screen framebuffer.

**Автоматизация:** частичные unit-контракты [index.tiledExport.test.ts](../../../apps/web/src/engine/index.tiledExport.test.ts), [index.tiledStroke.test.ts](../../../apps/web/src/engine/index.tiledStroke.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#145 (CLOSED, закрыта 2026-07-13)](https://github.com/SuselMan/art_lessons/issues/145). Статус нового запуска: NOT RUN.

<a id="qa-503"></a>

## QA-503 — Малый zoom infinite и LOD

**Начало и участники:** Длинная infinite комната с большим extent.

**Действия:** Уменьшить масштаб, pan по сцене, измерить replay/fold во время steady frames.

**Ожидание:** Нет чёрных тайлов, мипы дают качество, полный log не replay на каждом кадре.

**Автоматизация:** частичные unit-контракты [index.tiledMipmaps.test.ts](../../../apps/web/src/engine/index.tiledMipmaps.test.ts), [index.tiledDisplay.test.ts](../../../apps/web/src/engine/index.tiledDisplay.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#363 (CLOSED, закрыта 2026-07-30)](https://github.com/SuselMan/art_lessons/issues/363), [#365 (CLOSED, закрыта 2026-07-30)](https://github.com/SuselMan/art_lessons/issues/365). Статус нового запуска: NOT RUN.

<a id="qa-504"></a>

## QA-504 — Свёртка только когда нужна

**Начало и участники:** Bounded/infinite рисунок и активный stroke.

**Действия:** Рисовать при 100%, затем уменьшить, дождаться idle и повторить frames.

**Ожидание:** Не делается лишний full downsample каждый кадр; dirty coarse обновляется тогда, когда нужен.

**Автоматизация:** частичные unit-контракты [index.tiledMipmaps.test.ts](../../../apps/web/src/engine/index.tiledMipmaps.test.ts), [index.areaClearCoarse.test.ts](../../../apps/web/src/engine/index.areaClearCoarse.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#367 (CLOSED, закрыта 2026-08-06)](https://github.com/SuselMan/art_lessons/issues/367), [#503 (CLOSED, закрыта 2026-08-26)](https://github.com/SuselMan/art_lessons/issues/503). Статус нового запуска: NOT RUN.

<a id="qa-505"></a>

## QA-505 — Area clear на малом zoom

**Начало и участники:** Рисунок с заполненным fine и coarse, zoom меньше 50%.

**Действия:** Delete выделенную область, Undo/Redo, zoom100→small.

**Ожидание:** Нужная область очищена на всех LOD, пустой уровень не гасит весь слой.

**Автоматизация:** частичные unit-контракты [index.areaClearCoarse.test.ts](../../../apps/web/src/engine/index.areaClearCoarse.test.ts), [index.areaSelection.test.ts](../../../apps/web/src/engine/index.areaSelection.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#503 (CLOSED, закрыта 2026-08-26)](https://github.com/SuselMan/art_lessons/issues/503). Статус нового запуска: NOT RUN.

<a id="qa-506"></a>

## QA-506 — Большой bounded лист и memory

**Начало и участники:** Физический iPad, пустой A2 и 4096²; другие GPU для сравнения.

**Действия:** Открыть, добавить слои/штрихи, pan/zoom и context restore; замерить memory.

**Ожидание:** Тайловый bounded renderer не выделяет непосильный full-page FBO и не уходит в reload; ограничения GPU записаны.

**Автоматизация:** частичные unit-контракты [index.tiledStroke.test.ts](../../../apps/web/src/engine/index.tiledStroke.test.ts), [TiledLayerBuffer.test.ts](../../../apps/web/src/engine/src/buffers/TiledLayerBuffer.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#469 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/469), [#121 (CLOSED, закрыта 2026-07-19)](https://github.com/SuselMan/art_lessons/issues/121). Статус нового запуска: NOT RUN.

<a id="qa-507"></a>

## QA-507 — Восстановление многих слоёв без jetsam

**Начало и участники:** iPad с тяжёлой многослойной комнатой, обычные инструменты.

**Действия:** Restore и несколько минут работы; memory/reload/log восстановлений отдельно.

**Ожидание:** Не удерживаются все тяжёлые слои разом вне бюджета; нет циклического reload; jetsam не выдаётся за JS исключение.

**Автоматизация:** частичные unit-контракты [index.tiledEviction.test.ts](../../../apps/web/src/engine/index.tiledEviction.test.ts), [TiledLayerBuffer.eviction.test.ts](../../../apps/web/src/engine/src/buffers/TiledLayerBuffer.eviction.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#467 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/467). Статус нового запуска: NOT RUN.

<a id="qa-508"></a>

## QA-508 — Длинный replay без incomplete FBO

**Начало и участники:** Большой bounded/infinite log, несколько materials.

**Действия:** Холодно войти и восстановить историю, затем новый stroke/Undo.

**Ожидание:** Нет Framebuffer incomplete и молчаливого пустого холста; очередь replay завершается.

**Автоматизация:** частичные unit-контракты [index.tiledStroke.test.ts](../../../apps/web/src/engine/index.tiledStroke.test.ts), [index.contextRestore.test.ts](../../../apps/web/src/engine/index.contextRestore.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#385 (CLOSED, закрыта 2026-08-04)](https://github.com/SuselMan/art_lessons/issues/385). Статус нового запуска: NOT RUN.

<a id="qa-509"></a>

## QA-509 — DPR и 100% нативного масштаба

**Начало и участники:** Одинаковый world seed на DPR1/2 и разных ориентациях.

**Действия:** Выставить 100%, изменить orientation и вернуть.

**Ожидание:** Размер world pixels и бумаги соответствует DPR, pointer transform совпадает с камерой.

**Автоматизация:** частичные unit-контракты [pointerTransform.test.ts](../../../apps/web/src/pages/Room/viewport/pointerTransform.test.ts), [cameraMath.test.ts](../../../apps/web/src/pages/Room/viewport/cameraMath.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#154 (CLOSED, закрыта 2026-07-30)](https://github.com/SuselMan/art_lessons/issues/154). Статус нового запуска: NOT RUN.

<a id="qa-510"></a>

## QA-510 — Ось pinch при большом zoom

**Начало и участники:** Планшет с физическим multitouch, крупный zoom.

**Действия:** Вращать двумя пальцами вокруг удалённой от origin точки, затем рисовать в ней.

**Ожидание:** Центр жеста не уезжает, новый штрих попадает под перо.

**Автоматизация:** частичные unit-контракты [pinchTracker.test.ts](../../../apps/web/src/pages/Room/viewport/pinchTracker.test.ts), [cameraMath.test.ts](../../../apps/web/src/pages/Room/viewport/cameraMath.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#442 (CLOSED, закрыта 2026-08-26)](https://github.com/SuselMan/art_lessons/issues/442). Статус нового запуска: NOT RUN.

<a id="qa-558"></a>

## QA-558 — LOD маркера и brushPen

**Начало и участники:** Zoom0.32, marker/brushPen и peer.

**Действия:** Рисовать, Undo/Redo, reload, менять zoom без export/bake между capture.

**Ожидание:** Coarse вид обновлён сразу, мелкая копия не остаётся прежней до следующего zoom.

**Автоматизация:** частичные unit-контракты [index.tiledMipmaps.test.ts](../../../apps/web/src/engine/index.tiledMipmaps.test.ts), [index.tiledPreview.test.ts](../../../apps/web/src/engine/index.tiledPreview.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#694 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/694). Статус нового запуска: NOT RUN.

<a id="qa-571"></a>

## QA-571 — Fit учитывает панели

**Начало и участники:** Landscape768×512, правую панель открыть, rotation lock задан.

**Действия:** Fit canvas, initial entry, закрыть/открыть панели и повторить.

**Ожидание:** Весь лист помещается в реально доступную область, не под панель; lock/rotation сохранены.

**Автоматизация:** частичные unit-контракты [cameraMath.test.ts](../../../apps/web/src/pages/Room/viewport/cameraMath.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#768 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/768). Статус нового запуска: NOT RUN.

## Интерфейс и устройства

<a id="qa-511"></a>

## QA-511 — Слайдер пером с ладонью

**Начало и участники:** Физический Surface/Samsung, PrecisionSlider, ладонь на экране.

**Действия:** Медленно тянуть размер/opacity, удерживая контакт ладони.

**Ожидание:** Нет browser context menu и выделения текста; значение меняется плавно.

**Автоматизация:** частичные unit-контракты [precisionSlider.test.ts](../../../apps/web/src/components/PrecisionSlider/precisionSlider.test.ts), [useDragToAdjust.test.ts](../../../apps/web/src/lib/input/useDragToAdjust.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#102 (CLOSED, закрыта 2026-07-04)](https://github.com/SuselMan/art_lessons/issues/102), [#115 (CLOSED, закрыта 2026-07-07)](https://github.com/SuselMan/art_lessons/issues/115). Статус нового запуска: NOT RUN.

<a id="qa-512"></a>

## QA-512 — Тап minimal UI и возврат оболочки

**Начало и участники:** Планшет, полноэкранный редактор.

**Действия:** Тапнуть пустой холст для minimal/full, повторить после рисования и orientation change.

**Ожидание:** Тап распознан, оболочка возвращается целиком, нет вспышки интерфейса.

**Автоматизация:** частичные unit-контракты [tapSequence.test.ts](../../../apps/web/src/pages/Room/gestures/tapSequence.test.ts), [uiPreferences.test.ts](../../../apps/web/src/lib/browser/uiPreferences.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#159 (CLOSED, закрыта 2026-08-06)](https://github.com/SuselMan/art_lessons/issues/159), [#307 (CLOSED, закрыта 2026-07-27)](https://github.com/SuselMan/art_lessons/issues/307), [#423 (CLOSED, закрыта 2026-08-10)](https://github.com/SuselMan/art_lessons/issues/423). Статус нового запуска: NOT RUN.

<a id="qa-513"></a>

## QA-513 — Курсор кисти на бумаге

**Начало и участники:** Разные масштабы, тонкая/крупная кисть, light/dark paper.

**Действия:** Hover, stroke, pan/zoom и выход курсора из canvas.

**Ожидание:** Отпечаток виден, не обрезан собственным слоем и не моргает при WebGL redraw; subpixel кольцо различимо.

**Автоматизация:** частичные unit-контракты [cursorController.test.ts](../../../apps/web/src/pages/Room/overlays/cursorController.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#306 (CLOSED, закрыта 2026-07-27)](https://github.com/SuselMan/art_lessons/issues/306), [#481 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/481). Статус нового запуска: NOT RUN.

<a id="qa-514"></a>

## QA-514 — Touch scroll списка проектов

**Начало и участники:** Телефон/планшет с длинной коллекцией.

**Действия:** Скроллить вертикально с касанием карточки; отдельно намеренно drag/drop.

**Ожидание:** Обычный scroll не перехвачен DnD, deliberate reorder/перенос не спутан со scroll.

**Автоматизация:** частичные unit-контракты [useDraggablePosition.test.ts](../../../apps/web/src/lib/input/useDraggablePosition.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#331 (CLOSED, закрыта 2026-07-28)](https://github.com/SuselMan/art_lessons/issues/331). Статус нового запуска: NOT RUN.

<a id="qa-515"></a>

## QA-515 — Picker меняет режим без скачка

**Начало и участники:** Открыт color picker, square/triangle/ring и числовой ввод.

**Действия:** Переключать режимы, двигать курсоры к краям и вернуть прежний цвет.

**Ожидание:** Popup не подпрыгивает, HSV/RGB/alpha согласованы, edge geometry не выпускает курсор за допустимую область.

**Автоматизация:** частичные unit-контракты [triangleGeometry.test.ts](../../../apps/web/src/components/ColorPicker/modes/triangleGeometry.test.ts), [ringGeometry.test.ts](../../../apps/web/src/components/ColorPicker/modes/ringGeometry.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#337 (CLOSED, закрыта 2026-07-29)](https://github.com/SuselMan/art_lessons/issues/337), [#340 (CLOSED, закрыта 2026-07-29)](https://github.com/SuselMan/art_lessons/issues/340), [#341 (CLOSED, закрыта 2026-07-29)](https://github.com/SuselMan/art_lessons/issues/341), [#344 (CLOSED, закрыта 2026-07-29)](https://github.com/SuselMan/art_lessons/issues/344). Статус нового запуска: NOT RUN.

<a id="qa-516"></a>

## QA-516 — Fullscreen портальные элементы

**Начало и участники:** Desktop и Safari с фактически поддержанным Fullscreen API.

**Действия:** Войти fullscreen, открыть layer menu, modal, toast; закрыть fullscreen.

**Ожидание:** Все portals видны и интерактивны в fullscreen subtree; unsupported API не даёт сломанную кнопку.

**Автоматизация:** частичные unit-контракты [fullscreen.test.ts](../../../apps/web/src/lib/browser/fullscreen.test.ts), [popupPlacement.test.ts](../../../apps/web/src/lib/input/popupPlacement.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#357 (CLOSED, закрыта 2026-07-30)](https://github.com/SuselMan/art_lessons/issues/357), [#466 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/466). Статус нового запуска: NOT RUN.

<a id="qa-517"></a>

## QA-517 — Тост поверх панелей

**Начало и участники:** Открыта панель/viewport; событие создаёт notice.

**Действия:** Открыть notice с действием и закрыть крестиком возле панели.

**Ожидание:** Тост выше соответствующих stacking contexts, действие/крестик доступны.

**Автоматизация:** частичные unit-контракты [noticeStore.test.ts](../../../apps/web/src/stores/noticeStore.test.ts), [popupPlacement.test.ts](../../../apps/web/src/lib/input/popupPlacement.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#364 (CLOSED, закрыта 2026-07-30)](https://github.com/SuselMan/art_lessons/issues/364). Статус нового запуска: NOT RUN.

<a id="qa-518"></a>

## QA-518 — Панель после смены ориентации

**Начало и участники:** Floating panel у правого/нижнего края планшета.

**Действия:** Повернуть экран и изменить viewport, перетащить панель обратно.

**Ожидание:** Панель остаётся достижимой в новом viewport, её позиция ограничена экраном.

**Автоматизация:** частичные unit-контракты [panelPosition.test.ts](../../../apps/web/src/components/FloatingToolPanel/panelPosition.test.ts), [useDraggablePosition.test.ts](../../../apps/web/src/lib/input/useDraggablePosition.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#459 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/459). Статус нового запуска: NOT RUN.

<a id="qa-519"></a>

## QA-519 — Модалка перемещения проектов

**Начало и участники:** Есть папки с длинными именами и вложениями.

**Действия:** Открыть Move to, пройти уровни, выбрать папку на touch и desktop.

**Ожидание:** Имена/кнопки читаемы, допустимый выбор не перекрыт; перемещение соответствует показанному target.

**Автоматизация:** частичные unit-контракты [popupPlacement.test.ts](../../../apps/web/src/lib/input/popupPlacement.test.ts), [roomFolderRoutes.test.ts](../../../apps/server/src/roomRoutes/roomFolderRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#360 (CLOSED, закрыта 2026-08-06)](https://github.com/SuselMan/art_lessons/issues/360). Статус нового запуска: NOT RUN.

<a id="qa-520"></a>

## QA-520 — Иконки до загрузки шрифта

**Начало и участники:** Чистый кеш, задержан icon font.

**Действия:** Открыть вход/редактор, дождаться font, проверить все registry names.

**Ожидание:** Не вспыхивают слова-лигатуры; все зарегистрированные значки есть в subset, отсутствующий icon не скрыт type widening.

**Автоматизация:** частичные unit-контракты [iconFont.test.ts](../../../apps/web/src/icons/iconFont.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#179 (CLOSED, закрыта 2026-07-19)](https://github.com/SuselMan/art_lessons/issues/179), [#322 (CLOSED, закрыта 2026-07-29)](https://github.com/SuselMan/art_lessons/issues/322). Статус нового запуска: NOT RUN.

<a id="qa-521"></a>

## QA-521 — Safari карточки бумаги

**Начало и участники:** Физический iPad Safari и create form, узкое окно.

**Действия:** Открыть четыре варианта зернистости, сменить orientation и выбрать каждый.

**Ожидание:** Ряд/перенос соответствует layout, карточки не растянуты за viewport, выбор доступен.

**Автоматизация:** частичные unit-контракты [paperAssets.test.ts](../../../apps/web/src/engine/src/paper/paperAssets.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#465 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/465). Статус нового запуска: NOT RUN.

<a id="qa-522"></a>

## QA-522 — Логотип и навигация входа

**Начало и участники:** Join screen, полный и компактный header.

**Действия:** Нажать логотип, проверить полный wordmark/compact icon и PWA icons.

**Ожидание:** Переход доступен; текст не обрезан и не выглядывает из compact asset, иконки согласованы.

**Автоматизация:** частичные unit-контракты [iconFont.test.ts](../../../apps/web/src/icons/iconFont.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#379 (CLOSED, закрыта 2026-07-31)](https://github.com/SuselMan/art_lessons/issues/379), [#717 (CLOSED, закрыта 2026-10-04)](https://github.com/SuselMan/art_lessons/issues/717), [#719 (CLOSED, закрыта 2026-10-04)](https://github.com/SuselMan/art_lessons/issues/719), [#722 (CLOSED, закрыта 2026-10-05)](https://github.com/SuselMan/art_lessons/issues/722). Статус нового запуска: NOT RUN.

<a id="qa-523"></a>

## QA-523 — Язык и сохранение настроек

**Начало и участники:** Два поддержанных locale, чистая и сохранённая настройка приложения.

**Действия:** Переключить язык, открыть room/create/settings, перезагрузить.

**Ожидание:** Пользовательские строки переведены согласованно, сохранённый locale переживает смену комнаты; отсутствующие ключи выявляются.

**Автоматизация:** частичные unit-контракты [i18n.test.ts](../../../apps/web/src/i18n/core/i18n.test.ts), [uiPreferences.test.ts](../../../apps/web/src/lib/browser/uiPreferences.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#208 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/208). Статус нового запуска: NOT RUN.

<a id="qa-524"></a>

## QA-524 — Настройки размера и цвета инструмента

**Начало и участники:** Карандаш/ластик и несколько материалов, два устройства.

**Действия:** Настроить размер/opacity/цвет, сменить инструмент и вернуться; reload.

**Ожидание:** Собственные значения восстанавливаются по действующей политике и не переносятся как чужое общее состояние.

**Автоматизация:** частичные unit-контракты [toolSlice.test.ts](../../../apps/web/src/stores/slices/toolSlice.test.ts), [toolChoice.test.ts](../../../apps/web/src/pages/Room/tools/toolChoice.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#156 (CLOSED, закрыта 2026-07-16)](https://github.com/SuselMan/art_lessons/issues/156), [#682 (CLOSED, закрыта 2026-09-30)](https://github.com/SuselMan/art_lessons/issues/682). Статус нового запуска: NOT RUN.

<a id="qa-525"></a>

## QA-525 — Hotkeys при текстовом вводе

**Начало и участники:** Текстовая аннотация/rename активны, затем чистый canvas.

**Действия:** Нажать Undo/Delete/tool hotkeys в text input и после blur.

**Ожидание:** Текстовый ввод не запускает разрушительное действие холста; на canvas нужные hotkeys работают.

**Автоматизация:** частичные unit-контракты [editorHotkeys.test.ts](../../../apps/web/src/pages/Room/tools/editorHotkeys.test.ts), [hotkeys.test.ts](../../../apps/web/src/lib/input/hotkeys.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#405 (CLOSED, закрыта 2026-08-06)](https://github.com/SuselMan/art_lessons/issues/405). Статус нового запуска: NOT RUN.

<a id="qa-549"></a>

## QA-549 — Сто коротких штрихов Apple Pencil

**Начало и участники:** Активный iPad Safari, физический Pencil, чистый слой.

**Действия:** Вручную сделать 100 быстрых штрихов с полным отрывом, пересчитать input/ops/видимые линии и повторить после reload.

**Ожидание:** Нет пропуска примерно каждого 15-го контакта; generated CDP pen не заменяет эту проверку.

**Автоматизация:** частичные unit-контракты [PointerInput.touchDefault.test.ts](../../../apps/web/src/engine/src/input/PointerInput.touchDefault.test.ts), [PointerInput.pressure.test.ts](../../../apps/web/src/engine/src/input/PointerInput.pressure.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#517 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/517). Статус нового запуска: NOT RUN.

<a id="qa-554"></a>

## QA-554 — Создание без WebGL

**Начало и участники:** Новый browser context с getContext(webgl)=null.

**Действия:** Открыть существующую комнату и Create project; затем вернуть GL и retry.

**Ожидание:** Есть понятная заглушка вместо чёрного экрана; URL не выдаёт несуществующую комнату за созданную.

**Автоматизация:** частичные unit-контракты [webgl.test.ts](../../../apps/web/src/lib/browser/webgl.test.ts), [notOpenScreen.test.ts](../../../apps/web/src/pages/Room/status/notOpenScreen.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#570 (CLOSED, закрыта 2026-09-23)](https://github.com/SuselMan/art_lessons/issues/570). Статус нового запуска: NOT RUN.

<a id="qa-555"></a>

## QA-555 — Неизвестный route

**Начало и участники:** Browser без авторизации, затем вошедший.

**Действия:** Открыть несуществующий путь и старую/ошибочную ссылку.

**Ожидание:** Страница 404 со ссылками на проекты/создание, не пустой чёрный фон.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Источники/дефекты:** [#572 (CLOSED, закрыта 2026-09-23)](https://github.com/SuselMan/art_lessons/issues/572). Статус нового запуска: NOT RUN.

<a id="qa-591"></a>

## QA-591 — Пользовательская и общая палитра

**Начало и участники:** Два аккаунта в одной комнате, сохранённый цвет.

**Действия:** Создать именованную личную palette и room palette, добавить/выбрать цвет, reload и войти вторым автором.

**Ожидание:** Личная коллекция scoped пользователю; общая видна комнате и сохранена, цвета не теряются при reload.

**Автоматизация:** частичные unit-контракты [colorWell.test.ts](../../../apps/web/src/pages/Room/tools/colorWell.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#190 (CLOSED, закрыта 2026-07-18)](https://github.com/SuselMan/art_lessons/issues/190), [#192 (CLOSED, закрыта 2026-07-19)](https://github.com/SuselMan/art_lessons/issues/192), [#193 (CLOSED, закрыта 2026-07-19)](https://github.com/SuselMan/art_lessons/issues/193), [#194 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/194). Статус нового запуска: NOT RUN.

<a id="qa-592"></a>

## QA-592 — Калибровка нажима и размеры

**Начало и участники:** Перо поддерживает pressure, профиль с настройками калибровки.

**Действия:** Изменить pressure curve, нарисовать слабый/сильный stroke разными кистями, reload; включить временный инструмент.

**Ожидание:** Реакция меняется согласно curve, значения ограничены и сохранены; passing tool не затирает постоянные настройки.

**Автоматизация:** частичные unit-контракты [pressureCalibration.test.ts](../../../apps/web/src/lib/input/pressureCalibration.test.ts), [PointerInput.pressure.test.ts](../../../apps/web/src/engine/src/input/PointerInput.pressure.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#573 (CLOSED, закрыта 2026-09-23)](https://github.com/SuselMan/art_lessons/issues/573). Статус нового запуска: NOT RUN.

<a id="qa-593"></a>

## QA-593 — Числовой ввод параметра

**Начало и участники:** Tool settings с size/opacity/angle, fractional и предельные значения.

**Действия:** Ввести число, очистить поле, Esc/Enter, затем потянуть slider; сменить unit/инструмент.

**Ожидание:** Нет NaN/недопустимого состояния; число и slider соответствуют одной величине и своей шкале.

**Автоматизация:** частичные unit-контракты [numberInput.test.ts](../../../apps/web/src/lib/tools/numberInput.test.ts), [sliderScale.test.ts](../../../apps/web/src/lib/tools/sliderScale.test.ts), [precisionSlider.test.ts](../../../apps/web/src/components/PrecisionSlider/precisionSlider.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#553](https://github.com/SuselMan/art_lessons/issues/553). Статус нового запуска: NOT RUN.

<a id="qa-594"></a>

## QA-594 — Линейка и сетка как выбранный инструмент

**Начало и участники:** Активная кисть, ruler/grid modes и transform.

**Действия:** Последовательно выбрать grid/ruler/brush, временно привязать stroke, отменить.

**Ожидание:** В один момент выбран согласованный инструмент; вспомогательные overlays не пишут лишние общие операции и не ломают камеру.

**Автоматизация:** частичные unit-контракты [toolChoice.test.ts](../../../apps/web/src/pages/Room/tools/toolChoice.test.ts), [index.ruler.test.ts](../../../apps/web/src/engine/index.ruler.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#405 (CLOSED, закрыта 2026-08-06)](https://github.com/SuselMan/art_lessons/issues/405). Статус нового запуска: NOT RUN.

<a id="qa-595"></a>

## QA-595 — Справка и поиск по задаче

**Начало и участники:** Реализованная пользовательская документация в приложении.

**Действия:** Открыть Help, найти инструмент/задачу, перейти по результатам и вернуться в комнату.

**Ожидание:** Материал доступен и соответствует реализованным действиям; ссылки не уводят в пустой экран, рисунок сохранён.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Источники/дефекты:** [#584 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/584). Статус нового запуска: NOT RUN.

<a id="qa-596"></a>

## QA-596 — Звук карандаша и настройки

**Начало и участники:** Устройство с AudioContext, пользовательский mute/system volume.

**Действия:** Первым user gesture разрешить звук, рисовать разным pressure/speed, выключить звук и сменить комнату.

**Ожидание:** Звук следует параметрам и выключается настройкой, нет непойманного AudioContext error или накопления synth после смены комнаты.

**Автоматизация:** частичные unit-контракты [Variant3Synth.test.ts](../../../apps/web/src/lib/sound/pencilSoundV3/Variant3Synth.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#280 (CLOSED, закрыта 2026-07-23)](https://github.com/SuselMan/art_lessons/issues/280). Статус нового запуска: NOT RUN.

<a id="qa-597"></a>

## QA-597 — Импорт референса не портит соседей

**Начало и участники:** Большое референс-фото, два слоя и существующий рисунок.

**Действия:** Импортировать на отдельный слой, resize/rotate, убрать видимость, export, Undo/Redo; повторить отказ decode.

**Ожидание:** Рабочий рисунок соседнего слоя сохранён, ошибки видны, импорт имеет свой operation и восстанавливается.

**Автоматизация:** частичные unit-контракты [index.imageImport.test.ts](../../../apps/web/src/engine/index.imageImport.test.ts), [index.layerTransform.test.ts](../../../apps/web/src/engine/index.layerTransform.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#88 (CLOSED, закрыта 2026-07-05)](https://github.com/SuselMan/art_lessons/issues/88). Статус нового запуска: NOT RUN.

## Обновление и офлайн

<a id="qa-526"></a>

## QA-526 — Свежий документ после обновления

**Начало и участники:** Установлена предыдущая PWA/build, подготовлены две локальные сборки.

**Действия:** Открыть новую вкладку после смены served build; проверить HTML headers и stamped version.

**Ожидание:** HTML обновлён, hashed assets могут кешироваться; новая вкладка не удержана старым precache.

**Автоматизация:** частичные unit-контракты [navigationResponse.test.ts](../../../apps/web/src/pwa/navigationResponse.test.ts), [swConfig.test.ts](../../../apps/web/src/pwa/swConfig.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#294 (CLOSED, закрыта 2026-07-26)](https://github.com/SuselMan/art_lessons/issues/294), [#502 (CLOSED, закрыта 2026-08-25)](https://github.com/SuselMan/art_lessons/issues/502). Статус нового запуска: NOT RUN.

<a id="qa-527"></a>

## QA-527 — Возврат PWA из фона

**Начало и участники:** PWA на старой сборке; есть unsent outbox и обновлённый кандидат.

**Действия:** Свернуть/вернуть приложение, проверить update action, подтвердить только после сохранения очереди.

**Ожидание:** Версия видна, обновление не теряет работу; resume не оставляет незаметно старую сборку навсегда.

**Автоматизация:** частичные unit-контракты [updatePolicy.test.ts](../../../apps/web/src/pwa/updatePolicy.test.ts), [reloadSafety.test.ts](../../../apps/web/src/lib/browser/reloadSafety.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#515 (CLOSED, закрыта 2026-08-28)](https://github.com/SuselMan/art_lessons/issues/515). Статус нового запуска: NOT RUN.

<a id="qa-528"></a>

## QA-528 — SW не перехватывает API/socket

**Начало и участники:** Активный service worker, controlled failure API/WebSocket.

**Действия:** Вызвать network error и reconnect, открыть обычную навигацию offline.

**Ожидание:** API/socket сохраняют свой сетевой контракт, нет unhandled rejection из navigation fallback; offline UI определён.

**Автоматизация:** частичные unit-контракты [swConfig.test.ts](../../../apps/web/src/pwa/swConfig.test.ts), [navigationResponse.test.ts](../../../apps/web/src/pwa/navigationResponse.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#383 (CLOSED, закрыта 2026-08-04)](https://github.com/SuselMan/art_lessons/issues/383). Статус нового запуска: NOT RUN.

<a id="qa-529"></a>

## QA-529 — Старая доменная привязка SW

**Начало и участники:** Изолированная копия прежнего origin и новый origin; архивный сценарий.

**Действия:** Воспроизвести controlled navigation прежнего PWA и проверку регистрации SW.

**Ожидание:** Нет вечного redirect/cache lock; если старый origin недоступен, BLOCKED, не проверять на реальных пользовательских данных.

**Автоматизация:** частичные unit-контракты [swConfig.test.ts](../../../apps/web/src/pwa/swConfig.test.ts), [updatePolicy.test.ts](../../../apps/web/src/pwa/updatePolicy.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#355 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/355). Статус нового запуска: NOT RUN.

## Сервер и наблюдаемость

<a id="qa-530"></a>

## QA-530 — Ограниченное resident окно

**Начало и участники:** Тяжёлая комната со snapshots, гораздо больше операций, чем RAM window.

**Действия:** Войти, получить состояние/историю страницами, наблюдать heap и seq.

**Ожидание:** Сервер не грузит всю историю в RAM; missing-old-data можно дочитать без потери snapshot основы.

**Автоматизация:** частичные unit-контракты [roomLoader.test.ts](../../../apps/server/src/rooms/roomLoader.test.ts), [roomRegistry.test.ts](../../../apps/server/src/rooms/roomRegistry.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#206 (CLOSED, закрыта 2026-07-19)](https://github.com/SuselMan/art_lessons/issues/206), [#292 (CLOSED, закрыта 2026-07-27)](https://github.com/SuselMan/art_lessons/issues/292). Статус нового запуска: NOT RUN.

<a id="qa-531"></a>

## QA-531 — Комнаты освобождаются после ухода

**Начало и участники:** Три варианта: failed password join, повторный join в другую комнату, последний участник ушёл.

**Действия:** Повторить много циклов и проверить registry; отдельно удалить комнату через API.

**Ожидание:** Не остаются необоснованные резидентные комнаты; pending join имеет защиту от преждевременной eviction.

**Автоматизация:** частичные unit-контракты [roomRegistry.test.ts](../../../apps/server/src/rooms/roomRegistry.test.ts), [rooms.test.ts](../../../apps/server/src/rooms/rooms.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#292 (CLOSED, закрыта 2026-07-27)](https://github.com/SuselMan/art_lessons/issues/292), [#419 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/419), [#784 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/784). Статус нового запуска: NOT RUN.

<a id="qa-532"></a>

## QA-532 — Отказ при memory pressure

**Начало и участники:** Изолированный QA server с управляемым memory probe.

**Действия:** На порогах warning/admission попытаться новый join; существующий продолжает.

**Ожидание:** Новая нагрузка отказана предсказуемо, существующая комната не повреждена; unknown memory не объявлена OK.

**Автоматизация:** частичные unit-контракты [memory.test.ts](../../../apps/server/src/health/memory.test.ts), [roomRegistry.test.ts](../../../apps/server/src/rooms/roomRegistry.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#415 (CLOSED, закрыта 2026-08-10)](https://github.com/SuselMan/art_lessons/issues/415), [#207 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/207). Статус нового запуска: NOT RUN.

<a id="qa-533"></a>

## QA-533 — Health зависит от БД

**Начало и участники:** Изолированный API и управляемая БД.

**Действия:** Проверить healthy, отказ соединения, зависший DB reply.

**Ожидание:** Есть bounded503 при неисправности; HTTP200 не означает только живой Node; guest user не создаётся probe-запросом.

**Автоматизация:** частичные unit-контракты [healthRoutes.test.ts](../../../apps/server/src/health/healthRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#178 (CLOSED, закрыта 2026-07-28)](https://github.com/SuselMan/art_lessons/issues/178), [#334 (CLOSED, закрыта 2026-08-06)](https://github.com/SuselMan/art_lessons/issues/334). Статус нового запуска: NOT RUN.

<a id="qa-534"></a>

## QA-534 — Порог диска и event loop

**Начало и участники:** Unit probes с граничными/unknown значениями, отдельный QA нагрузочный процесс.

**Действия:** Проверить warn/critical ровно на watermark, один долгий stall и насыщение многих задач.

**Ожидание:** Неизвестное не OK; обнаружены оба вида нагрузки; диск/heap/loop представлены раздельно.

**Автоматизация:** частичные unit-контракты [disk.test.ts](../../../apps/server/src/health/disk.test.ts), [eventLoop.test.ts](../../../apps/server/src/health/eventLoop.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#324 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/324), [#415 (CLOSED, закрыта 2026-08-10)](https://github.com/SuselMan/art_lessons/issues/415). Статус нового запуска: NOT RUN.

<a id="qa-535"></a>

## QA-535 — Graceful shutdown сохраняет результат

**Начало и участники:** Свой QA процесс, активная очередь записи, безопасная disposable БД.

**Действия:** SIGTERM, дождаться завершения записи, restart и rejoin.

**Ожидание:** Принятые операции доступны, shutdown отчёт сохранён, клиент сам возвращается; чужие процессы не трогаются.

**Автоматизация:** частичные unit-контракты [shutdown.test.ts](../../../apps/server/src/health/shutdown.test.ts), [roomPersistence.test.ts](../../../apps/server/src/rooms/roomPersistence.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#497 (CLOSED, закрыта 2026-08-24)](https://github.com/SuselMan/art_lessons/issues/497), [#499 (CLOSED, закрыта 2026-08-25)](https://github.com/SuselMan/art_lessons/issues/499), [#504 (CLOSED, закрыта 2026-08-25)](https://github.com/SuselMan/art_lessons/issues/504). Статус нового запуска: NOT RUN.

<a id="qa-536"></a>

## QA-536 — Бан аккаунта администратором

**Начало и участники:** Admin allowlist, обычный user и две его сессии.

**Действия:** Обычным user открыть admin; admin банит с причиной, unban, revoke; смоделировать write fail.

**Ожидание:** Чужим 404, действия атомарны с audit, нельзя забанить себя/другого admin; failed write не оставляет ложный ban в памяти.

**Автоматизация:** частичные unit-контракты [adminRoutes.test.ts](../../../apps/server/src/admin/adminRoutes.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#585 (CLOSED, закрыта 2026-09-24)](https://github.com/SuselMan/art_lessons/issues/585), [#586 (CLOSED, закрыта 2026-09-24)](https://github.com/SuselMan/art_lessons/issues/586), [#587 (CLOSED, закрыта 2026-09-24)](https://github.com/SuselMan/art_lessons/issues/587), [#588 (CLOSED, закрыта 2026-09-24)](https://github.com/SuselMan/art_lessons/issues/588). Статус нового запуска: NOT RUN.

<a id="qa-537"></a>

## QA-537 — Временный IP ban и proxy

**Начало и участники:** Admin и несколько clients за проверенным proxy.

**Действия:** Забанить IP на разрешённый срок, дождаться expiry, повторить mapped IPv4; попробовать свой/admin IP.

**Ожидание:** Закрыты нужные sockets, срок истекает, защищённые адреса не забанены ошибочно, audit полный.

**Автоматизация:** частичные unit-контракты [adminRoutes.test.ts](../../../apps/server/src/admin/adminRoutes.test.ts), [sessions.test.ts](../../../apps/server/src/auth/sessions.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#589 (CLOSED, закрыта 2026-09-24)](https://github.com/SuselMan/art_lessons/issues/589), [#590 (CLOSED, закрыта 2026-09-24)](https://github.com/SuselMan/art_lessons/issues/590). Статус нового запуска: NOT RUN.

<a id="qa-538"></a>

## QA-538 — Sentry без чувствительных данных

**Начало и участники:** Изолированный env без DSN и с тестовым transport.

**Действия:** Вызвать безопасное exception/invariant; проверить payload и React error handling.

**Ожидание:** Без DSN не отправляется; cookies/bodies/headers и inferred identity не попали в событие, release указан, tracing выключен.

**Автоматизация:** частичные unit-контракты [sentryOptions.test.ts](../../../apps/server/src/health/sentryOptions.test.ts), [sentry.test.ts](../../../apps/web/src/lib/observability/sentry.test.ts), [reportInvariant.test.ts](../../../apps/web/src/lib/observability/reportInvariant.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#177 (CLOSED, закрыта 2026-07-29)](https://github.com/SuselMan/art_lessons/issues/177), [#480 (CLOSED, закрыта 2026-08-24)](https://github.com/SuselMan/art_lessons/issues/480). Статус нового запуска: NOT RUN.

<a id="qa-539"></a>

## QA-539 — Snapshot lag watcher

**Начало и участники:** Живая и пустая комната, контролируемый seq lag.

**Действия:** Превысить threshold, не увеличивать/удвоить lag; затем восстановить и повторить.

**Ожидание:** Сигнал только для живой отстающей комнаты, ограничено повторение; после восстановления новый инцидент виден.

**Автоматизация:** частичные unit-контракты [snapshotLagWatch.test.ts](../../../apps/server/src/health/snapshotLagWatch.test.ts). `npx vitest run <путь-выбранного-теста> --maxWorkers=1`; [условия и ограничения](execution.md#специальные-и-unit-проверки). Ручной acceptance обязателен.

**Источники/дефекты:** [#480 (CLOSED, закрыта 2026-08-24)](https://github.com/SuselMan/art_lessons/issues/480). Статус нового запуска: NOT RUN.

## Эксплуатация и выпуск

<a id="qa-540"></a>

## QA-540 — Проверка backup восстановлением

**Начало и участники:** Отдельная одноразовая БД и копия backup без production доступа на запись.

**Действия:** Восстановить backup в disposable БД, сравнить counts/hashes нужных таблиц и snapshots.

**Ожидание:** Данные читаются и совпадают, проверяется восстановление, а не только наличие файла.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Источники/дефекты:** [#315 (CLOSED, закрыта 2026-07-28)](https://github.com/SuselMan/art_lessons/issues/315). Статус нового запуска: NOT RUN.

<a id="qa-541"></a>

## QA-541 — Сжатие статических ассетов

**Начало и участники:** Локальная production-like nginx конфигурация и baked assets.

**Действия:** Проверить заголовки/размеры JS/CSS и уже gzip paper/preview.

**Ожидание:** JS/CSS сжаты; paper/preview не сжимаются второй раз, client получает ожидаемые bytes.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Источники/дефекты:** [#342 (CLOSED, закрыта 2026-07-29)](https://github.com/SuselMan/art_lessons/issues/342), [#437 (CLOSED, закрыта 2026-08-11)](https://github.com/SuselMan/art_lessons/issues/437). Статус нового запуска: NOT RUN.

<a id="qa-542"></a>

## QA-542 — Две последовательные выкатки

**Начало и участники:** Изолированный CI/config review; production deploy не запускать.

**Действия:** Проверить concurrency config на двух входящих revision и порядок migration→server start.

**Ожидание:** Новые jobs не ломают уже идущий deploy; schema готова до запуска нового кода; факт runtime проверяется отдельным разрешённым стендом.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Источники/дефекты:** [#422 (CLOSED, закрыта 2026-08-10)](https://github.com/SuselMan/art_lessons/issues/422), [#598 (CLOSED, закрыта 2026-09-24)](https://github.com/SuselMan/art_lessons/issues/598), [#621 (CLOSED, закрыта 2026-09-28)](https://github.com/SuselMan/art_lessons/issues/621). Статус нового запуска: NOT RUN.

<a id="qa-543"></a>

## QA-543 — Бюджет диска сборок

**Начало и участники:** Изолированные disposable образы/артефакты; защищённые данные помечены.

**Действия:** Проверить предусмотренную ротацию завершённых SHA images и QA disposable ресурсов.

**Ожидание:** Старые расходники не заполняют диск; production volumes, worktrees и незакоммиченный код защищены.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Источники/дефекты:** [#199 (CLOSED, закрыта 2026-07-19)](https://github.com/SuselMan/art_lessons/issues/199), [#275 (CLOSED, закрыта 2026-07-27)](https://github.com/SuselMan/art_lessons/issues/275). Статус нового запуска: NOT RUN.

<a id="qa-544"></a>

## QA-544 — Типизация служебных скриптов

**Начало и участники:** Рабочая копия с совместимыми deps, без runtime старта.

**Действия:** Проверить состав typecheck scripts config и команду на ошибочном временном fixture без публикации.

**Ожидание:** apps/web/scripts и e2e включены в соответствующие гейты; зелёный typecheck не пропускает исключённые файлы.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Источники/дефекты:** [#348 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/348). Статус нового запуска: NOT RUN.

<a id="qa-573"></a>

## QA-573 — Shared dist в server image

**Начало и участники:** Изолированная собранная копия server image без production env.

**Действия:** Запустить одноразовый server из image со своей тестовой БД.

**Ожидание:** Runtime разрешает @grafetto/shared из правильного dist; ошибка не отложена до production boot.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Источники/дефекты:** [#184 (CLOSED, закрыта 2026-07-19)](https://github.com/SuselMan/art_lessons/issues/184). Статус нового запуска: NOT RUN.

<a id="qa-574"></a>

## QA-574 — Отказ offsite backup не зелёный

**Начало и участники:** Изолированный backup-check с устаревшим последним upload и контролируемым отказом B2.

**Действия:** Проверить свежесть локальной и offsite копий, смоделировать failure/переполнение.

**Ожидание:** Health/alert показывает сбой offsite и диск, не PASS только по локальному dump; секреты не выводятся.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Источники/дефекты:** [#555 (CLOSED, закрыта 2026-09-22)](https://github.com/SuselMan/art_lessons/issues/555). Статус нового запуска: NOT RUN.

<a id="qa-579"></a>

## QA-579 — Архитектурная карта подсвечивает связи

**Начало и участники:** Локальная карта, модуль с входящими/исходящими рёбрами.

**Действия:** На вкладке Структура выбрать модуль, перемещать/снять выбор.

**Ожидание:** Подсвечены нужные рёбра и направление; это engineering UI, отдельно от регрессии урока.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Источники/дефекты:** [#643 (CLOSED, закрыта 2026-09-28)](https://github.com/SuselMan/art_lessons/issues/643). Статус нового запуска: NOT RUN.

## Проверка достоверности QA-стенда

<a id="qa-575"></a>

## QA-575 — Offline probe действительно обрывает WebSocket

**Начало и участники:** Готовый тестовый browser и peer.

**Действия:** Включить используемый offline helper, доказать disconnect/socket отсутствие, отправить контроль, вернуть сеть.

**Ожидание:** Проверяется настоящее отключение transport, а не только HTTP navigator flag.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Источники/дефекты:** [#690 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/690). Статус нового запуска: NOT RUN.

<a id="qa-576"></a>

## QA-576 — Bridge join с пустой формой

**Начало и участники:** Доступный device bridge, нет заполненного join имени.

**Действия:** Открыть комнату, дождаться формы и отправить корректный join, затем engineReady.

**Ожидание:** Helper не ждёт бесконечно engine до submit и не выдаёт недопуск за product crash.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Источники/дефекты:** [#692 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/692). Статус нового запуска: NOT RUN.

<a id="qa-577"></a>

## QA-577 — Oracle загрузки учитывает snapshot

**Начало и участники:** Известный snapshot и покрытая им история.

**Действия:** Прогнать validator входа по плану snapshot+tail, отдельно лишнюю/недостающую history.

**Ожидание:** Checker не требует весь старый log поверх snapshot; реальная missing dependency всё ещё выявляется.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Источники/дефекты:** [#756 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/756). Статус нового запуска: NOT RUN.

<a id="qa-578"></a>

## QA-578 — M70 модель не теряется в стенде

**Начало и участники:** QA URL/модель выбраны явно, несколько boards.

**Действия:** Перейти A→B→A, записать фактический tool preset и модель из accepted operations.

**Ожидание:** Сравниваются действительно M70 операции, helper не сделал legacy stroke; ошибка 790 не выдаётся за физику движка.

**Автоматизация:** MANUAL; готового standalone runner нет.

**Источники/дефекты:** [#790 (OPEN, не закрыта)](https://github.com/SuselMan/art_lessons/issues/790). Статус нового запуска: NOT RUN.

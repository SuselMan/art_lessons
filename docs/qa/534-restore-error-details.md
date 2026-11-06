# #534 — причина ошибки восстановления в телеметрии

06.11.2026, база `f8ba325e0ce7dfe71bb8f6a280928166c316ca96`.
Worktree `534-release-restore-error`, ветка `agents/534-release-restore-error`.

Чистый buildRestoreReport добавляет failure errorName/errorMessage; SDK-обёртка
передаёт их в snapshot_restore context и breadcrumb. Сетевая TypeError/Failed to fetch,
HTTP Error/snapshot blob:503 и ошибка выделения RangeError теперь различимы.
Группировка событий по verdict/stage/problems не меняется.

Отчёт не сериализует error, stack, cause, Response или неизвестные throw values.
Для Error передаются допустимое имя и первая строка message, максимум 240 символов:
absolute/relative/blob/data/file URL удаляются, структурированные фрагменты скрываются.
SyntaxError получает общее описание, поскольку сообщение JSON.parse может цитировать
полученное тело. Для не-Error остаётся только категория значения.

## Доказательства

Новый тест вызывает настоящую reportSnapshotRestore с подменённым транспортом SDK,
проверяя фактические аргументы captureMessage и addBreadcrumb, а не один formatter.
Baseline: **9 FAIL / 10**. После изменения и расширения privacy-cases:
**79 / 79, 7 файлов, 5.03 с** — вся диагностика и snapshotRestore.

Проверены причины network/HTTP/decode, URL с token/query, относительный путь в кавычках,
blob/data URL, сырое JSON-подобное значение, parser excerpt, stack/cause, null/undefined/
объект/строка, ограничение длины, прежняя группировка и отсутствие события для status none.
Первый formatter ошибочно счёл `blob:` перед пробелом схемой URL; требование непустого
адреса исправлено, HTTP-причина сохраняется целиком.

UI, сеть восстановления и рендер не меняются; браузерный/аппаратный повтор для передачи
полей в SDK не нужен. Sentry-транспорт в тесте изолирован, внешних событий не отправлено.
Логи проверок находятся в игнорируемом temp/534-release-restore-error.

Typecheck (включая финальный web), lint:fix, map:check, map:rules: exit 0.
Временные dependency views, shared dist и paper link убраны; собственных runtime,
контейнеров, volumes или карточек сервисов для этой задачи не создавалось.

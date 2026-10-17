# Результат запуска <run-id>

- Дата и timezone, исполнитель:
- Case IDs и вариант (порядок действий, модель, seed):
- Исходники: frontend SHA/build version, backend SHA, harness/input SHA; dirty diff hash:
- Окружение: dev/production-build, локальная disposable БД, flags, бюджет GPU:
- Устройства по отдельности: модель, ОС, browser/version, renderer/API, DPR, viewport, ориентация:
- Участники: независимых identities / sockets / browser contexts / физических GPU / физических перьев:
- Предусловия, исходное состояние, параметры и фактически выполненные шаги:
- Ожидаемый результат и заранее выбранный порог времени/пикселей:
- Статус каждого gate и каждого устройства: PASS / FAIL / BLOCKED / NOT RUN / INCONCLUSIVE:
- Факт: ID/order/payload сравнение, actual-before-oracle, changed channels/max, timings:
- Ограничения измерения, retries, отличия от определения кейса:
- Дефекты: issue + что остаётся открытым; expected FAIL перечислить отдельно:
- Компактные доказательства (относительные ссылки без auth/private URL), SHA входа:
- Последнее подтверждённое прохождение этой lane (ссылка либо «нет данных»):
- Уборка: свои PID/context/socket/room/auth/disposable, оставшиеся ресурсы и срок:

Итог набора не может быть PASS, если хотя бы один обязательный gate FAIL/BLOCKED/NOT RUN/
INCONCLUSIVE. Частичный функциональный PASS не закрывает performance или cross-device FAIL.

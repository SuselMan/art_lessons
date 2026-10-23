# #780: присутствие нескольких сокетов

Исходная база: 4c6beeca. Исправление: 3a36c6b93ab29de9af86b6bc942bf318403408bc.

Baseline real rooms/gate: 1 regression failed, 141 existing passed; latest owner socket disconnect удалял живого owner.
Baseline actual Socket.IO: 2 regression failed, 9 existing passed; отсутствовала отмена live хвоста конкретного закрытого socket.

После исправления server: 38 suites / 685 tests PASS. Последний добавленный actual owner-wire тест проверен отдельным Socket.IO прогоном: 14/14 PASS. Server tsc --noEmit PASS; git diff --check PASS. Server lint script отсутствует.

Проверки: обе очередности disconnect; latest board fallback/peer_board_changed; role/color/frozen/hand сохранены; finalsocket evicts empty lesson+boards; переход между уроками сохраняет board roster; peer_left только на finalsocket; closed socket live cancellation не задевает still-held sibling tail; bounded128 activeIDs/socket, ID<=256, end освобождает ID, refused live не учитывается. Реальная работа frozenowner подтверждается operation ack, student остаётся frozen.

Зависимости: lockfile совпал с 728-watercolor-room-integration. В собственных node_modules были только scoped dependency symlinks, @grafetto/shared указывал в packages/shared этой рабочей копии, vitest alias на shared/src. Shared dist собирался только локально для tsc. После проверок links, dist, tsbuildinfo, vitest cache и disposable QA config удалены. Сервисов, браузеров, устройств не создавалось; backend4558 не менялся.

Ограничение: backend runtime promotion и аппаратный online QA выполняет координатор. Production, main, shared/frontend source и публикации не затронуты.

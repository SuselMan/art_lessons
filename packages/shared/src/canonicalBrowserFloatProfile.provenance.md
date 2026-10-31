# Закрытый контракт browser-highp-rgba8-v1

Новый профиль использует существующую оболочку version 2 и coverage browser-number-coverage-v1 (байт 3 у процедурных auto tags 1–4). Единственная закрытая таблица связывает профиль, версию и разрешённые coverage. Старые профили сохраняют свои версии, правила и байты; восемь scalar/NEON записей проверяются прежними SHA-256 в тесте.

Это контракт данных, не включение исполнения. Default остаётся старым native профилем. Несогласованные пары raster/coverage, неизвестные профили, неверная mask coverage и reserved flags отклоняются. Старый CPU mask preparation явно отказывает browser coverage до получения soft-program lease. Конструкторный frontier проверяется настоящим original empty-room read до обращения к canvas; production guard находится в отдельном engine unit.

Tests-first: 8 ожидаемых отказов нового контракта при проходящем native golden. После реализации: 193 теста в 11 shared suites; точечный lint и diff-check проходят. После согласованной shared build41468: 66 тестов/3 suites (новый контракт, prepass и настоящий constructor frontier) проходят. Shared noEmit и server source-alias TSC проходят; web source-alias inventory имеет только чужие tests-first ошибки canonicalRoomController.test.ts, новый собственный граф без ошибок. Общий app/SW gate согласуется отдельно с владельцами текущих изменений. Ни новая CPU арифметика, ни GPU kernels, ни политика сервера этим unit не активируются.

Подробные компактные журналы: temp/device-runs/krita-stroke-20261024/fixes-v52/browser-profile-*. Новых процессов, runtime-копий и ресурсов устройства unit не создаёт.

# #728: actual Room — первый контакт нового moment transport

8 октября 2026, Surface/Chrome154. Frozen DEV source `1c9c4409`, controller `62fb3e44`; runtime отдельно от обычных QA стендов. Проверены HTTP SHA исходников и семь неизменных baked-paper файлов. Приватные адреса в документ не включены.

Один реальный PointerInput контакт round400, `normal:100:100:PB29:round`, в свежей комнате: packed operation58bytes, **один retained dab**, четыре source commands. Native включён; новый moment transport действительно вызван: ordinal0, `supported=true`, `applied=true`, violations0, maxExcess0. Контроллер проверил соответствие recipe/ordinal actual retained source callback. Это не тест многодабового штриха400.

После idle actual GL framebuffer содержал13656 фиолетовых пикселей; export1754×2480 имел42762 пикселя с ненулевой alpha. Ошибок страницы нет, GL error0, context lost=false. Промежуточный диагностический framebuffer показывал17799 изменённых пикселей, но purple0: немедленная видимость пигмента и пользовательская отзывчивость этим прогоном **не подтверждены**. Full material readback перед транспортом и framebuffer/export наблюдения воздействуют на очередь; wall интервалы нельзя считать физической задержкой пера или GPU длительностью.

RAM: preflight1991MiB, минимум1204MiB, после закрытия собственной страницы1969MiB; guard1700preflight/500abort сохранён. Console init/source markers записаны на диск сразу. Первый запуск остановился до ввода из-за Node TLS trust; отдельное исходное свидетельство сохранено. Повтор использовал публичный rootCA данного dev-сервера через NODE_EXTRA_CA_CERTS, без глобального отключения TLS.

Persistent raw: `temp/fast-watercolor-night/room-moment400-surface-20261008-ca/report.json`; оригинальный preinput TLS failure — соседняя папка без суффикса `-ca`. Собственная CDP страница закрыта, Surface явно освобождён. Другие arms и устройства не запускались.

Открыто: плотный многодабовый зигзаг400, реальная water→pigment сцена, author/replay GPU parity, carrier после сложного осадка, сравнение с OFF и фотографиями, скорость/плавность. Этот PASS подтверждает только применение нового совместного P.B/C оператора к одному реальному supported source contact. Никаких выводов о натуральности и готовности production.

Контракт и ограничения: [DEV Room seam](728-dev-room-moment-transport.md); ранее GPU-vs-CPU synthetic texture proof: [texture gate](728-wet-moment-texture-surface.md).

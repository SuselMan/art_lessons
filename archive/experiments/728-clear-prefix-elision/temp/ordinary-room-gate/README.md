# Обычная загрузка комнаты — подготовка #728

Исходник c092bb925532de903fcaf61d50bced6cb39766d8, 990 файлов сверены.
Единственная QA overlay передаёт диагностический clear-prefix flag из query
в настоящий useRoomRestore. В root production caller flag не передан.

samsung-ordinary.mjs использует raw CDP и настоящие Create/Join/Socket операции,
не standalone engine. Backend4539 не меняется. Новый локальный room содержит
исходные47 операций, сохраняет dabs/wet/timestamps/gesture/wash. Меняются лишь
уникальные operation IDs/target IDs и authenticated user IDs нового room.
Прогон планирует OFF/ON ordinary join, Undo48/Redo49, затем разрешает нормальный
bootstrap snapshot49 и fresh rejoin с проверкой actual restore call и wholeRGBA.

Первый запуск own1445 отказал до комнаты из-за fixture returnByValue DOM object.
Исправлен wait Boolean(await expression), CPU проверены async false/true/object/null.
Второй own1446 создал SNOONay_, сервер подтвердил47seq/pending0. Последний пассивный
опрос: rebuildJobs1, settlefalse, canonicalfalse, contextlostfalse. После этого seed завершился, bitmap captured, snapshot index204 проверен.
Открылся ordinary reader1447; затем15s Runtime.evaluate timeout на fresh join.
Exec34159 EXIT1, оба target1446/1447 CLOSED finally.
Это INCONCLUSIVE во время actual join; никак не подтверждает ускорение/регрессию helper.

Ретрая без root review нет. Следующая fixture корректировка: редкие state polls
с ограниченным60s CDP deadline и общим900s watchdog, чтобы15s primitive timeout
не принимался за окончательный отказ долгого настоящего rebuild. Не выключать
rebuild, не переставлять undo, не удалять историю/production snapshots.

В probe bake временно null только в своих seed/reader pages для реального204.
После UndoRedo возвращается настоящий bake, server POST и snapshot index проверяются.
Сам normal bootstrap/update policy не заменён; если не публикуется, это отдельный
наблюдаемый отказ, не повод принудительно вызвать uploader или изменить seq.

Контроллеры/артефакты приватные temp, в Git не входят. Source runtime5330 сохраняет
исторический c092; не менять пользовательский5329/backend4539.

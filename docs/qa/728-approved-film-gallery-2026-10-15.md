# Утверждённая v3 в Grafetto QA и галерее

Прямое поручение Ильи15.10.2026 10:50 после просмотра сравнения: подключить модель в Grafetto и обновить галерею. Runtime source cfcb3541; ветка agents/728-watercolor-room-integration. Production/main/push не затронуты.

QA5384 выбирает front8-detail-flow-v3 по умолчанию. Выбор bounded Dry8 теперь зависит от записываемой модели и работает без qaFastDry. Старые операции сохраняют свои версии. Standalone5383 оставлен прежним образцом.

Проверки кода:2 entry unit-теста, web typecheck, targeted oxlint:fix, map:check/map:rules — exit0 (известные предупреждения карты). Два теста publisher проверяют сохранность старых versions/frames/comments и запрет публикации при ошибке GPU; Pillow12.3.0 во временном окружении.

Samsung: реальный SM-T970, Adreno650; создание через /create без query.12 мазков приняты; modelv3/batch8, Dry4283мс в одном сценарии; redo/reentry canonical exact, GL0/lostfalse, PNG1989885bytes. Статистика этого smoke не является физическим pen-to-photon.

Галерея пересчитывается на AMD headed Chrome:11 листов/85 архивных слотов, те же SHA исходных журналов06–07.10,400мс между операциями, wc@front8-detail-flow-v3 в каждой watercolor-записи, image imports исключены, ordered Dry и canonical idle перед PNG. Без diagnosticCoarseTransport: настройки модели соответствуют текущей Grafetto QA. Опубликована отдельная immutable версия cfcb3541-film-v3-20261015:11листов/85JPEG. Все85HTTP-SHA совпали с файлами; мобильный390px default selection новой версии и переключение старой прошли без pageerrors. Полный аудит1885ссылок:missing[]. Comments SHA неизменён. Старый overlay сохранён в backup, current release не менялся.


AMD room smoke без query: оба автора по умолчанию v3/Dry8, точка второго автора в мокрой области до Dry (sample>0),3строки журнала двух авторов. Peer/undo/redo/reentry/context restore дают0 отличий; PNG и network snapshot доступны, GL0/errors[]. Это один AMD GPU; между GPU строгого совпадения не заявляется.

Картинки представлены автономным [атласом](runs/728-approved-film-gallery-2026-10-15/atlas.jpg); манифест и browser proof лежат рядом. Временные полноразмерные PNG, копии входов и Python-окружение удалены на VPS и ноутбуке через registered cleanup с сохранённой проверкой активных процессов. Собственные браузеры, reverse15384 и ADB19223 закрыты. Остались2QA frontend/1backend, постоянные JPEG/previews и комнаты.

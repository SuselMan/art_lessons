# #728: приватная подготовка обновления галереи

Подготовлен CPU pipeline `temp/gallery-stage/crop_stage.py` в worktree728-snapshot-history-closure и HOME680-water-wet-tone-qa. Он читает immutable11ON PNG из HOME680-lifetime-hardware/temp/night-load-ui/temp/gallery-combined и пишет исключительно свою временную папку assets. Публикация не выполнена.

Каждый лист проходит проверки GL/report errors, renderer model phase+baked+rebase, frozen source version f877b418-ring-baked-on, SHA исходного журнала, физических размеров листа и каждого immutable slot. В manifest сохраняются фактический raw filename, raw/report/journal SHA, размеры crop и JPEG SHA. Sheet4 использует только валидный sheet4-on-retry1.png; прежний невалидный bootstrap не удалён. RGBA явно накладывается на белый фон перед resize и JPEG; простое convert RGB не применяется.

Draft overlay содержит честное описание замороженного f877b418bc52ac8b0ebb938f8d77c533722a7906 с экспериментальными phase+baked, а не утверждение о текущей combined сборке. Он ещё не пригоден для прямой записи в gallery data: относительные img paths требуется связать с отдельно одобренным immutable preview. Проверка полного выпуска требует11листа/85crop и завершённого root visual review всех85.

Действующий сервис linux-setup/scripts/gallery/server.py накладывает data/rendered.json через render_overlay.py на immutable current archive. Comments хранятся отдельно. На момент подготовки comments.json содержал217записей, SHA413d0283b170c62edddb7a9dc7d18b8f6af2de1153a1d11efc7f0bf8dab6f0dc. Pipeline не пишет current/data/previews и не изменяет комментарии/старые версии.

Для последующей разрешённой публикации требуется существующий update.lock, новый immutable preview, сохранение предыдущего rendered overlay, добавление только нового уникального version и атомарная замена rendered.json. При hardlink copy metadata и новые assets нельзя менять на месте: сначала unlink destination, затем write/copy. Rollback должен убрать только новый overlay/version/preview, сохраняя старые assets и комментарии. Это план, не выполненная публикация.

# #728: неподтверждённая сушка и watermark снимка

Локальный `paper_dry` применяется оптимистически, сразу закрывает воду и входит в doneOperations. Он не является PixelOperation и поэтому прежний hasPendingPixelOps(layer) его не замечает. После завершения сушки layer quiet/settled может разрешать bake, хотя seq клиента ещё предшествует неподтверждённой сушке.

Минимальное исправление: OperationLog.hasPendingPaperDry проверяет done-записи существующего pending tail; _snapshotSettled отказывает любому слою до подтверждения или отзыва Dry. Формат, watermark, UI и операторы рисования не меняются.

Проверки используют настоящие OperationLog, appendOperation, confirmOperation, discardOperation и bakeNetworkSnapshot. Engine fixture содержит пиксели pencil и подтверждённый encoded water donor без новых dabs, чтобы проверить публикацию, а не точность software-GL растекания. Dry до ACK запрещает bake; подтверждение seq2 разрешает; отзыв Dry возвращает active-water запрет. Отдельно сохранён pending pixel stroke контроль. 76 targeted тестов PASS. Полный web typecheck PASS через отдельный temporary tsconfig, разрешающий пакеты и @types из существующей real-deps копии; installs/symlinks не создавались. Подстановка прежнего index.ts даёт падение именно на bake pending Dry (получает bytes вместо null).

Это CPU/software-GL проверка безопасного публикационного gate, не устройство/сетевой restore тест. Автоматическое включение первого uploader исследуется отдельно root.

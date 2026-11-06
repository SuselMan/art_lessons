# #746 — поздняя зависимость проходит проверку исходной структуры

06.11.2026, база `a4583c0535471ea580af17e7a2bf419f1a521e8d`.
Worktree `746-release-prefix`, ветка `agents/746-release-prefix`.

До изменения prepareSnapshotReplay загружал/проверял structural prefix только
перед циклом полной истории зависимых слоёв. Поздняя Undo удаления, найденная в
такой истории, меняла план на replayStructure, обходя уже выполненную проверку.

Загрузка и проверка префикса теперь находятся внутри того же монотонного цикла.
loadedStructure гарантирует одну загрузку на попытку; historicalIds сохраняет
исходный префикс. Проверка reconstructable base и bounded watermark остаются
прежними; нормальные snapshots не начинают читать тяжёлую историю.
Разрешение gesture siblings и цепочек controls из #759 сохраняется.

## Регрессии

На текущем формате операций: baseline **4 FAIL / 16**, после **16 / 16 PASS**.
Обычные stroke и layer_clear как начальные targets Undo каждый проверяются
с существующим и отсутствующим original layer_add S. Это общий контракт истории,
не разработка M70. Для исходного add S проверяются replayStructure, historyLayers S,
original historicalId и ровно один prefix query с seq<=watermark.
Без add S требуется явный отказ, а не придуманный structural base.

Существующий safe-snapshot тест подтверждает ноль запросов полной истории.
Глобальная Dry отдельно проверена как replay barrier без выдуманной послойной
Undo-зависимости. Исторический M70 fixture имел несовместимый с текущим протоколом
layerId у paper_dry; typecheck это обнаружил. Он не используется как доказательство:
актуальный baseline и новые тесты используют валидные ordinary operations.

Серверная проверка зависимостей не меняет протокол и рендер. В этой задаче не
создавался браузерный/аппаратный стенд; GPU к этому инварианту не относится.
Компактные логи находятся в игнорируемом temp/746-release-prefix.

Полный финальный rooms/routes + клиентский snapshotRestore: **643 / 643**,
25 файлов, 31.05 с. Typecheck-valid-format, lint:fix, map:check/map:rules: exit 0.
Собственные временные dependency views, shared dist и paper link убраны.
QA runtime, контейнеры/volumes и карточки сервисов здесь не создавались.

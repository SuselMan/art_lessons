
### Подготовленный изолированный runtime f0b784ed

HOME runtime `680-puddle-outline/temp/firstload-sync-f0b784ed` использует собственный HTTPS порт 5341 и существующий backend 4539. PID при запуске: 1416563; cwd — `apps/web` указанного runtime. Новый QA config сохраняет исходный Vite config, добавляет alias shared на собственную копию и strictPort. Зависимости настоящие, из ancestor; установки и symlink не выполнялись. Это временный QA процесс, не постоянный сервис.

Паспорт `source-passport.json`: все 940 файлов совпали. `runtime-ready.json` сохраняет HTTP SHA трёх ключевых модулей, HTTP 200 create, authenticated clients=[], SHA семи файлов бумаги. Архив: SHA256 `1219aec3b1b6c11c0f82f1d3b0ad809e83956e31bcde79e9af7a39f541f9726d`. CPU dry-run контроллера принял 47 исходных операций с SHA `dec30b3a6399c3835819b71fa651cd41f213394ff4bba6f51a7df30292ca1266`. Браузер/GPU не запускались; actual server ACK47 и authoritative ordering остаются обязательными runtime guards, а не уже доказанными результатами.

Undo/Redo в этом контроллере выполняются через appendOperation; это проверка семантики журнала, не UI кнопок. Переносные guards tests читают QA_INPUT, если задан, иначе сохранённый исторический VPS fixture path. Для HOME обязательный QA_INPUT — runtime/input47.json.

### Первый ordinary прогон: readiness INVALID, не элиминация FAIL

Handle99959 EXIT1/CLOSED. OFF seed/ordinary full47 exact (39 actual paint calls), но Undo48 не меняет clear11/pixels. Выборка собственного QA backend доказала: clear11.author=local, Undo48.author=настоящий UUID. Это предусмотренный OperationLog wrong-author no-op. Seed helper ждал engine/paperReady, но не завершения applyIdentity; guard до input теперь требует настоящего store.userId !=local и совпадения engine._userId. Автор не подменяется в Undo. Исправлены оба ready helper и дополнительный pre-seed guard. Серверный selected evidence — runtime/result-firstload-off-on/undo-authority.json; исходный INCOMPLETE отчёт и PNG сохранены. GPU освобождён, ON не запускался, retry требует следующего grant.

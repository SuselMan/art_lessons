# #728: локальные инструменты при занятой canonical FIFO

Кандидат от cbe52652, `_wcAsyncFinish` по-прежнему выключен по умолчанию. Реальный двухавторский Room выявил отказ `_onStart` для pencil, пока удалённая акварель занимала FIFO. Исправление принимает обычный input и немедленно записывает/отправляет операцию; её material replay выполняется после старых запросов.

Презентация использует отдельные копии только затронутых тайлов выбранного слоя и обычный painter. Слой компонуется с прежней opacity; eraser удаляет alpha копии, не рисует белый overlay. Следующий локальный штрих копирует предыдущую ожидающую презентацию. Канонический экспорт не читает эти копии. Консервативный общий лимит 64 MiB учитывает до восьми ribbon buffers на тайл; превышение выключает только preview, сохраняя dabs/journal/ACK. При потере контекста accepted journal остаётся, transient handles забываются без GL удаления. Незавершённый неотправленный хвост не объявляется сохранённым.

CPU: 24 async tests, совместно 49 tests (async/peer-live/peer-preview/context/FIFO) PASS. Pencil/marker/eraser/smudge: canonical до drain неизменен; settings preset/color/layerId лочатся на старте; callback один; после drain packed replay byte-exact. Eraser alpha уменьшается; два ожидающих pencil previews сохраняются; cap не теряет delivery. Настоящий web typecheck, lint, map:check PASS; map:rules 0 errors/4 прежних warnings. Логи: `temp/async-multiplayer/local-tools-*.log`.

Это CPU gate, не аппаратная проверка. Обычный Room, multi-peer, undo/redo/reconnect/loss и фактическая видимость/GL проверяются отдельным hardware matrix до включения по умолчанию. Smudge на ещё не завершённой акварели показывает предварительную копию; окончательная краска определяется FIFO journal replay.

Multi-tile review: preview представляет union всех ожидающих tiles слоя; latest побеждает только совпавший origin. Отдельный двухтайловый тест предотвращает исчезновение первого штриха. Smudge preview imprint/replay-chunk освобождается по собственным userId/strokeId; потеря контекста не удаляет мёртвые GL handles. No-ACK тест явно сохраняет pending=true/state=done после drain: optimistic material не ждёт сервер.

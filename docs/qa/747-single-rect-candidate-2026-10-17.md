# #747: single-rect candidate

Ветка agents/747-single-rect, base b5d29e7c. Прототип в отдельном worktree;
основной QA runtime и shaders не менялись этим прогоном.

Поддерживается bounded комната с единственным tile, каждая сторона — целое
положительное число<=1024, page dimensions в точности совпадают с tile.
Native/controller material buffers, dry target и restored CPU snapshots
проверяют независимые width/height. Числовой API остаётся square-compatible.
BackgroundMix/ContrastPhase используют aspect-preserving lowgrid maxside256;
для square lowgrid, числовые uniforms и формулы сохранены. Connectedcomponents
проверены на portrait/landscape grid с отсутствием wrap между строками.

Проверено unit: обе ориентации512×768/768×512 принимают stroke; nativecontroller
получает фактические размеры. Park/restore сохраняет raw ink bytes, eraser
меняет dry baseline без изменения wet ink, Dry затрагивает только целевой слой.
Dry undo/redo history и invalid/mismatching geometry проверены отдельно.
MockGL не доказывает картинку, художественную эквивалентность и GPU convergence.

Focused6files:40PASS; затем strict geometry extra-test+8testfilePASS (41unique).
Web typecheck, scoped oxlint и git diff --check — PASS.
Исходное ожидание source5args в728-undo-v1.test.ts не включено в кандидата:
это уже исправленная root base747 lease-regression (6thoptions), не rectbug.

До интеграции требуются аппаратные landscape/portrait live/replay/Dry/rejoin,
thirdwet cache и контроль square exact-input SHA. Базовый8-layer residency
hardware run следует закончить до изменения размера, чтобы разделить причины.
Infinite/multi-tile,1240×1754 и strict AMD/Intel determinism остаются открыты.
Новых служб/контекстов/fixture/auth здесь нет; isolated worktree и совместимые
per-entry dependency links сохранены как рабочие исходники.

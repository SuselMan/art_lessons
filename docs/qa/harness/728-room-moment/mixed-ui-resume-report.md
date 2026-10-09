# Read-only rejoin существующей ON-комнаты

ONE Surface cohort, room 9jGkDkf8, без рисования. Runtime/paper SHA совпали с прошлым ON, actual constructor joined/lease=true, actor согласован, JS/network errors=0. Строгая проверка whole RGBA завершилась mismatch. Это пока **не доказанная регрессия продукта**: QA readiness проверяет participant/engine/paper, но не authoritative content-restore completion; getOperations=[] совместимо с snapshot baseline. Actual whole был потерян из compact из-за assertion до сохранения. Исправлен порядок сохранения; 2 negative CPU tests PASS. Нового hardware повторения нет.

DB сохраняет обе authored stroke, undo, redo и paper_dry seq1..5. Snapshot layer-1 seq5 непустой (1079988 compressed bytes), unverified, hash сохранён в DB proof. Visible layer opacity1. Само наличие snapshot не доказывает, что QA дождался restore. Export до/после вызывает exportPNG(true), то есть transparent; paper исключена в обоих случаях. Viewport не задаёт размер этого экспорта.

Контекст, frontend5381 и forward9455 закрыты, fresh RAM1954MiB. Disposable finish SAFE-HOLD active-process guard; сообщено root для стандартной cleanup, без обхода защиты. Следующий шаг: доказать authoritative restore gate и сохранять compact фактического canvas/layer/restore состояния до сравнений; существующие history checks не должны требовать старые stroke в engine tail после checkpoint.

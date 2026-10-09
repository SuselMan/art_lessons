# Isolated VPS sender small-source smoke — PASS

Отдельная новая QA-комната RyRU5iv9, software/headless sender only, zero Surface usage. Hard30, own browser process был закрыт/убит после результата, no orphan contexts; source фронт5381/shared backend4558 и manualroom не изменены.

Общее окно launch→cleanup13.585с. Visible document и authoritative owned readiness подтверждены. Actual PointerInput24: DOWN19.2ms; MOVE0.7/11.9ms; UP25.9ms. Browser-clock down.begin→up.end58.4ms; это только CPU submission trace, не visible latency/GPU/performance proof. Следующий read engine operation metadata вернулся примерно через4.7с после UP; внутри этого окна causal spans не записывались. Источник LRTikNXbe2 присутствует в engine accepted history, no page errors. Его server DB acceptance отдельно не проверялась этим smoke.

Это исключает утверждение, что VPS actual PointerInput24 всегда deadlock. Отличие от предыдущего incomplete peer cohort — там sender уже принимал remote A water operation перед собственным stroke. Engine _onStart при несовместимом pending predecessor вызывает _completeSettle, но длительность этого вызова в old cohort не записана, поэтому это проверяемая гипотеза, а не установленный GPU виновник.

Для будущей диагностики controller сохраняет wall READY/input begin/returned, rAF heartbeat и renderer/vendor metadata без readPixels/fences. В текущем smoke этих новых полей нет; не выдавать их за записанные ранее. Нового smoke/cohort повторения нет. Compact сохранён до disposable finish; mixed-vps-sender-smoke SAFE-HOLD сообщён root.

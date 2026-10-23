#728 (ночная проверка акварели): новый аппаратный результат очереди.

- Surface fixed replay400/Fine: средние5.99→2.45с (~59%),334→133–134ticks. Все26fields/material/RGBA/tape exact, meaningfulUndo/exactRedo.
- Samsung Adreno650: OFF/ON/ON/OFF средние5.80→2.68с (~53.7%). Все26fields+2materialtiles/RGBA/tape exact, meaningfulUndo/exactRedo, GL0/lostfalse, минимумRAM1363MiB. Собственные страницы закрыты, питание не менялось.
- Actual Room400 на Surface проверяется сейчас: реальные PointerInput жесты, второй DOWN во время settle, вода→пигмент, Dry/Undo/Redo/reentry. Уже снят OFF; финальное сравнениеON не завершено. Это отдельный gate от replay.
- Native Room400 запланирован после освобождения Surface. Room40 прошёл только functional/live/nonempty, неGLparity.

Кандидат очереди сохраняет исходные операции/Q8/порядок, группирует до4 соседних contact/front за кадр под8ms после sync каждой единицы. Production/default OFF. Main/push/deploy не выполнялись.

Отчёты: docs/qa/harness/728-gl-queue-batch/README.md и docs/qa/harness/728-gl-queue-samsung/README.md. Полная живость/анимация/физическая latency не следуют из replay выигрыша.

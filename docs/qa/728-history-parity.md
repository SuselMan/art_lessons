# Первый native→history проход: oracle и план локализации

Основа main8aa7e9f0, отдельная ветка agents/728-history-parity в существующей рабочей копии. Новая публикация не разрешена.

CPU аудит исправляет прежнюю формулировку wet-tone QA: `_syncBuffersToLog()` создаёт отсутствующие слои и перестраивает только их. Существующий tone-слой эта функция не перестраивала. Поэтому прежняя пара Dry/rebuild0px была двумя экспортами native-buffer, а не независимым полным replay. Undo/Redo вызывает настоящий `_rebuildLayer()`; первый переход показал26px, повторные history endpoints стабильны. Точный canonical export baseline/candidate при смене только wet-tone программы остаётся валидным0px.

Также приватный wet-tone controller вызывал `watercolorDryAll()` напрямую без журнального `paper_dry`: это меняет CPU wetness/wash lifetime, но не добавляет исторический барьер. Настоящая Room-кнопка отправляет paper_dry. Это fixture confound, ещё не доказанная причина26px. Проверяем обе версии, без пропуска операций/ослабления pixel oracle.

Новый bounded fixture выполняет четыре случая: один сухой пигмент, один мокрый пигмент, исходные три штриха с незаписанной сушкой, те же три штриха с настоящими paper_dry markers. Каждый сохраняет native PNG, явный `_rebuildLayer('tone')` PNG, Undo/Redo и повторный полный rebuild. До каждого `_finishRibbonStroke` фиксируются реальные P/C/V/coverage/film/dry поля в ROI128×96 и finish context. ReadPixels сохраняет прежний framebuffer binding. Source и художественная модель не изменены.

CPU controller и embedded JS скомпилированы. Контроллер/HTML: `temp/history-parity/run.mjs`, `temp/history-parity/review.html`. GPU пока занят другим агентом, ни Chrome, ни эксперимент не запущены. После причинной локализации: обычный Room UI, один/несколько слоёв и участников, мокрые наложения, Dry/clear/delete/UndoRedo/rejoin/context.

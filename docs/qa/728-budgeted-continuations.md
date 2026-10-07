# #728 — продолжения расчёта между кадрами (эксперимент)

База 4776f98d; кандидат 4ae813e7. По умолчанию выключен.
Принцип cross-device-determinism: Operation Log, исходные daбы, физические команды и их порядок не меняются. Меняется только момент исполнения существующих continuation callbacks.

Queue получает optional lifecycle.isExpedited() от захваченного owner/gesture. Вне рисования при таком запросе или canonical backlog допускаются до четырёх callbacks в прежнем 4 ms budget. После одного rAF допускаются не более двух отдельных postTask (setTimeout fallback), затем обязательный rAF. Это возможность для браузера обработать ввод/рисование, а не доказательство фактической презентации кадра. Новое рисование, потеря ownership, завершение и отмена прекращают owned tasks. Continuation не обновляет clock последнего rAF и не скрывает late gate.

24 CPU теста проходят: старый default OFF, порядок, cap, обязательный rAF, новый input, postTask rejection, abort до callback, замена job, loss внутри submitted unit, final sync. Whole-web TypeScript проходит в private dependency-backed copy. Hardware этого кандидата ещё не проверен, root/default не менялись.

## Причинная диагностика на Vega

Два bounded headed прогона immutable 059809f8: `quantum-vega-result.json` и `quantum-vega-stratified.json` в temp/canonical-budget отдельного worktree 728-canonical-backlog-budget. Оба завершились, собственный Chrome закрыт. AMD Radeon/ANGLE, GL0, contextLost=false; все 27 meaningful field/whole endpoint comparisons exact0. Это standalone immutable journal, не native Room FPS.

Первые 16 единиц синхронизированы отдельным reusable FBO/readPixels1×1; второй прогон выборочно измеряет индексы физических jobs и сохраняет actual pass labels. Дополнительные readbacks меняют расписание; времена диагностические.

- `gl.finish` возвращается за 0–0.1 ms, но следующий tiny read ждёт до 71.9 ms. JS finish clock не доказывает GPU completion.
- Контактная единица содержит brushPass C/P pair: 0.7–1.6 ms с фактическим fence на выбранных warmed samples.
- Front единица содержит четыре waterFrontStep: 7–9.3 ms. Нельзя назвать её ограниченной 4 ms.
- Финальная физическая единица содержит девять fieldOp: 4.5–6 ms.
- Drawing final continuation занимает 78–93 ms CPU: nested Plan.prepare 37–51 ms, fieldFor 0.1–0.2 ms; оставшиеся 41–42 ms ещё требуют атрибуции. Суммировать nested времена нельзя.

В protected f685 lazyContacts/splitQuanta выключены. Plan.prepare eager brushDragContacts строит все CPU контактные поля. Существующий lazy seam уже уменьшал target prepare в прежних тестах, однако его общий native pipeline не признан плавным.

Следующий gate: сохранить полные операции, использовать реальные split front/source-copy units и immutable lazy metadata; измерить completion clock и native active/tail/newtouch перед enable. Простое увеличение callbacks без настоящего GPU budget запрещено.

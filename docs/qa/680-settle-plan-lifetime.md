# #680: освобождение входов отменённого осадка

База: `179ce12a`. Изолированное исправление жизненного цикла; операторы, шейдеры, модель и порядок проходов не изменены.

При поле S2 план удерживает `a0`, `ca0` и полноразмерные снимки. Раньше они возвращались в pool только из `finish`; отмена настоящего solver оставляла их вне свободного списка, поэтому здоровый `engine.destroy()` их не удалял.

Каждый план теперь владеет всеми захваченными входами и предоставляет идемпотентный `dispose`. Queue abort вызывает cleanup без landing. Закрытый план не выполняет поздний finish. При потере и восстановлении контекста общий владелец забывает старые handles до отмены, поэтому cleanup не возвращает мёртвые имена в pool. Дополнительной глобальной generation нет.

Проверка: регрессия запускает настоящий `_finishRibbonStroke` с полем S2 и отменяет созданный job. Старый исходник базы падает: ожидаемое освобождение каждого входа один раз, фактически ноль (`temp/lifetime/baseline-negative.txt`). На кандидате проходят отмена с повторным cleanup, здоровое уничтожение и потеря контекста с нулём GL-вызовов/возвратов мёртвых входов.

29 тестов в четырёх файлах проходят: новый lifecycle integration, WatercolorSettlePlan, WatercolorSettleQueue и index.contextRestore (включая checkpointloss базы). Typecheck, lint, map:check, map:rules и diff check проходят; lint/map сохраняют существующие предупреждения. Аппаратная проверка ожидает отдельного GPU слота. Публикации нет.

## Аппаратный gate на интегрированном 5f306dfc

Отдельный home mirror `680-lifetime-hardware`, порт 5311. Renderer: `ANGLE (AMD, AMD Radeon Graphics (radeonsi renoir ACO), OpenGL 4.6)`. Проверены реальные flags: combined segment, solvent=true, bottomless, foreignSolvent=true. Полный SHA-манифест источника и архив сохранены в `680-device-qa-guards/temp/lifetime-hardware`; контекстные attrs первоначальный passport не записал, ограничения метода не скрываем.

Реальный S2 job захватил четыре входа. После двойной cancel и после healthy engine.destroy каждый входной texture/FBO удалён ровно один раз, owner Set пуст, GL0. Actual WEBGL_lose_context закрыл job: ноль возвратов мёртвых входов в pool, ноль их delete-вызовов, owner Set пуст. Это handle ownership proof, не оценка утечки по RSS. Искусственный scratch изолирован от пользовательских комнат; loss case закрыт без повторного использования забытых handles.

Frozen65 replay: пять canonical buffers (P/C/V/dryP/dryC), точные SHA/суммы и весь прозрачный PNG совпали с прежним 7322/defaultOFF oracle. Coverage отдельно не измерялась. Wall settle 17 599.7 ms — время полного replay/background, не FPS. Обычный нативный UI-мазок: 14 970 непрозрачных пикселей, undo даёт 0, redo восстанавливает исходный SHA точно; GL0 во всех трёх состояниях.

Два bootstrap failure до fixture: transient create form ошибочно считался join; затем архив не содержал игнорируемую baked paper. Driver исправлен, подключён существующий baked asset через symlink. Это не solver failures. Все запущенные Chrome закрыты в finally. Timer observer/производительность на этом слоте не запускались. Артефакты: `temp/lifetime-hardware/results/report.json`, `fixed65.png`, `native/report.json` в QA worktree (не коммитятся).

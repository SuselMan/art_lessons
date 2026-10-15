# Общая вода: отдельная подача пигмента, 15.10.2026

База cc79935a + два DEV-only диагностических флага в RibbonStrokePainter, defaults false. QA material остаётся front8-detail-flow-v3 без изменения. Production execution игнорирует оба флага. Они предназначены для сравнения экспорта, не для сохранения операций с новым поведением в общей комнате: отдельная версия материала нужна до принятия кандидата.

На реальном AMD Radeon Graphics (radeonsi renoir ACO), Chrome ANGLE, рассчитаны 12 экспортов: первые watercolor strokeId из журналов листов 1,5,6; все операции данного strokeId сохранены, preset переведён на v3. Размер3508×2480, medium paper, fence batch8. В каждой четвёрке один и тот же ввод. Все12: GL0, contextLost=false. Это визуальная абляция подачи, не тест скорости и не подтверждение межустройственной точности.

А/current: неизменная подача. Б/landing: landingWet берётся до касания, возвращая стартовый избыток на сухом листе. В/delivery: wetPull и gate dwell/brake читают prior wet вместо own+prior water. Г/both: оба изменения. Поле воды, transport и composite не переключались. Unit проверяет одинаковую доставку/standing воды, меньшую дозу хвоста в В, большую начальную дозу в Б и одинаковую подачу на fully prewet бумаге. 9 тестов preparation pass; web typecheck pass; web oxlint pass (штатные warnings, см.лог).

Визуально Г делает хвост прозрачнее относительно А и подчёркивает начало, сохраняя новую фактуру. Это не точное воспроизведение 0a78ab53: оптика и transport остаются новыми. Художественный выбор Ильи ещё не получен. Основная QA модель не переключена, галерея целиком не пересчитывалась.

Результаты: runs/728-pigment-source-ab-2026-10-15 — кропы, GPU reports, checks. Входные журналы: worktree680-device-qa-guards/temp/gallery-8aa-refresh/ops_{1,5,6}.json. Harness: harness/watercolor-pigment-source-ab.cjs, аргумент1 — каталог с этими журналами и выходными файлами. Сравнение опубликовано отдельной статической страницей watercolor-pigment-source-20261015/ существующего сервиса материалов.

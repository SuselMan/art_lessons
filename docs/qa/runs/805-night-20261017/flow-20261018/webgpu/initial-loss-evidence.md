# Проверка силы гипотезы Q8 перед новой реализацией

Полный Q8 вариант **не реализован**: после общего bound root запросил фактическую оценку. CPU helper `macro17-initial-loss-audit.cjs` читает сохранённые common input6-byte-per-pixel fixtures и запускает production research `initialIntegerDynamic`, затем независимую точную1024 half-pixel реконструкцию. Сырые входы не копируются в Git, GPU/сеть/перезапись fixtures не используются.

Компактный результат13actual captured входов: `initial-reconstruction-loss.json`. Это **INITIAL coarse reduction**, а не конечная матрица после GPU-физики: финальная raw coarse матрица не экспортировалась. Поэтому эти значения опровергают сильную гипотезу для начала, но не ограничивают неизвестный final floorloss.

Alpha floorloss относительно actual input:0.0012–0.0434%. Максимум отдельного minor color channel0.1726% (sheet5). Mini-wave alpha0.0017%, minorB0.0364%. На этих initial данных floor не объясняет почти пустую картинку или сильное изменение цвета; расширять Q8 только из worst-case32opaque bound не обосновано. FinalRGBA8, оптическое отображение и actual final matrix — отдельные вопросы, причинность не установлена.

## Sheet12: более сильное локальное изменение

Input alpha sum2,420,311 bytecodes. Globalnearest carrier+literal даёт2,420,311.265 (отличие первичной coarse reduction/rounding). Pure smooth floor теряет103.603 bytealpha=0.004281%. Local stationary fallback добавляет Δ=−5723.623 bytealpha=−0.236483%. Итог hybrid до8bit2,414,484.039, около−0.24075%input.

Stationary fine-пикселей504, literal alpha18,523=0.7653%input; из них frozenWetAlpha15,738=0.6502%, полностью frozen coarse cell1. Главный ROI x192..199/y488..495:64stationaryпикселя, Δ−4589.459 (около80%отрицательного итога). Все stationary лежат в bboxx178..846/y465..557, поэтому bbox сам по себе не означает сплошную заблокированную область. Полный top12 coarse ROI есть в JSON.

Механизм initial отрицательного Δ: all-smooth добавил бы соседний mobile/deposited halo на fine-пиксели уже фиксированного frozen-cell, а безопасный local nearest сохраняет там исходный literal и не принимает halo. Это не доказанная ошибка физики и не floor. Простое принятие/clamp halo нарушает исходную capacity-гарантию. Возможная будущая консервативная перераздача отвергнутого halo по соседним доступным ёмкостям — другой оператор; сначала нужно actual sheet12 PNG/guard/null0-vs12, а не новая модель ради0.24%.

Repro: `NODE_PATH=<existing node_modules> node macro17-initial-loss-audit.cjs <saved fixtures dir>`. Частные пути и raw paint в отчёт не входят. Execution8s CPU, новых сервисов/процессов/устройств нет. JSON содержит input суммы, initial summary, точную ideal/floor/local identity и геометрию ROI. Файл helper проверяет exact columnsum identity и падает, если она нарушилась.

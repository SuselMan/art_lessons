# Профиль интерфейса Worker Mini на Samsung

`node --test observer.test.cjs` проверяет сохранение вызовов и строгий response patch. Запуск с существующим собственным CDP-forward 19336:

```sh
QA_OUTPUT=/private/registered-output node run.cjs
QA_CONTROL=display-off QA_OUTPUT=/private/registered-output node run.cjs
QA_CONTROL=morph-off QA_OUTPUT=/private/registered-output node run.cjs
QA_CONTROL=goal-barriers QA_OUTPUT=/private/registered-output node run.cjs
QA_TRACE=1 QA_OUTPUT=/private/registered-output node run.cjs
```

Для display/morph контроля в output предварительно нужен исходный `chunk-3TO6NZCW.js`; его SHA и единственный anchor проверяются. Gate читается приватно из access.json установленного стенда. Нужны отдельный зарегистрированный cache, foreground ChromeMain и предварительная проверка serial. Hosted UI не изменяется; контексты закрываются в finally. Системный forward/bootstrap убираются оператором.

`summarize.cjs report...` формирует фазовые показатели. `trace-summary.cjs /private/trace-output` сохраняет выбранные события без URL. Итоги — samsung-summary.json и samsung-trace-summary.json.

Три последовательных одинаковых волны, после каждой цели 1 с морфинга. Main таймер 10 мс продолжал работать во время провалов RAF; длинных main tasks не было. JSON-контроль и отключение morph/display не устранили провалы. Трасса показала Swap throttled 2/2 до позднего transaction ACK при продолжающемся Android VSync. Причина задержки ACK не установлена. Диагностические barriers меняют pipeline; их wall-time не является GPU elapsed. Один порядок прогонов, разные свежие движки/авторские входы; это не pixel-equivalence и не статистический speed benchmark.

**Correction22:36:** `goal-barriers` is a historical misnomer. Exact Chrome revision3ff7ac5a implements WebGL finish as Flush. The0–0.1ms values do not establish GPU completion. Actual readback probes are investigated separately.

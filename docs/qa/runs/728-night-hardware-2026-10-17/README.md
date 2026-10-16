# Аппаратные проверки 17 октября

На `8680f05f` проверены Surface Intel и Samsung Adreno650. На Surface ранняя проверка короткого пера выполнена на `9df0f12c`. Это целевые проверки видимости мокрого мазка и задержки undo; межустройственный детерминизм здесь не проверяется.

- `short-input-baseline.json`: Surface, DOWN/1/2/6MOVE при pressure0.2/0.75 и новый красный штрих по мокрому синему. Пигмент виден уже при DOWN. Dwell-таймер не активен.
- `samsung-short-input.json`: чистая вода и пигмент95/34 видны при DOWN и удержании пера; actual compositorROI. #743 в этих сценариях не воспроизведён и остаётся открытым.
- `undo10-surface.json`: CPU9.7ms, подтверждение184ms, кандидат локального display283ms, у второго участника575ms. Screenshot даёт отдельную верхнюю границу с задержкой транспорта.
- `undo30-pending-surface.json`: CPU15.8ms; новый held-мазок принимается при активном rebuild job. Это диагностический engine callback после nativeCtrl+Z. Время локальной готовности включает намеренное удержание пера.
- `undo100-surface.json`: CPU22.1ms, подтверждение201ms, замена слоя2187ms. Наблюдение screenCache8×8 за первые2s истекло до замены; compositor затем подтверждает удаление красного мазка. За undo появились3 вычисления цели и2 отмены. Поле pass=false относится к лимиту наблюдения2s.
- `samsung-undo10.json`: реальный finiteGPUbudget300MiB, CPU12.6ms, замена слоя195ms. Холодный перезаход сохраняет11 состояний журнала и байты actualROI после удаления красного мазка.

Surface использовал отдельные Playwright contexts с DPR1/hasTouch=false; пользовательская страница имеет DPR1.5/touch10. GPUbudget в обоих случаях Infinity из-за deviceMemory8. Samsung использовал rawCDP isolated browsercontext, сохранив реальные touch5/DPR2.125/deviceMemory4 и budget300MiB. Cookies основной Android-сессии не менялись.

Ни один снимок actual не получен через экспорт/replay oracle или принудительный display. Чтение screenCache сохраняет framebuffer bindings, проверяет GLerrors и добавляет наблюдательную стоимость. Физическое появление пикселей ограничивается compositor screenshot, а не timestamp JS.

Временные профили и disposable-комнаты пока сохранены для повторной проверки оптимизации. Их точные владельцы и PID зарегистрированы приватно в `temp/device-runs/728-night-hardware-20261016b/resources.json`.

На `e86db307` повтор100 на той же спецификации ввода дал CPU22.2ms, swap1931.5ms и1 новое вычисление цели без отмен (до guard:3 вычисления/2 отмены). Это один прогон, поэтому оценку выигрыша скорости не обобщаем. Live-слой побайтно совпал с fullReplay:0 отличий, SHA256 `082c1157896b1d7ec227a6108db1a547b6307bb807cfc05375056dea6369aa63`. Восьмипиксельный screenCache probe по-прежнему не дал надёжной границы первого отображения в2s.

`long-surface.json` и `long-samsung.json` закрывают отдельную гипотезу #743 о переходе между сетевыми частями мазка:1620 dabs,2 отправленных800-dab операции и18 текущих dabs, перо ещё удерживается. На Surface DPR1.5 actualROI содержит синий пигмент (meanChroma156); на Samsung с реальным budget300MiB синий RGB65/102/215 также виден доUP. На Surface rAFmedian16.7ms,p95=16.9ms,max66.5ms за4145 кадров; задержки доставки CDP не являются скоростью ввода пользователя. Жалоба #743 остаётся невоспроизведённой в проверенных условиях.

На runtime `0c83ca99` загрузка одной fixture100×8dabs/102operations проверена на обоих устройствах в обычном режиме, annotationURLpreview и компактном annotation390CSS. Режим аннотаций включён уже при первом рисовании истории. SurfaceDPR1.5: внутренний roomOpen1.923/1.057/1.085s; SamsungnativeDPR2.125:2.397/2.592/2.220s. ОшибокGL/JS нет, аннотация восстановлена. Полная навигация Vite-стенда занимает10–14s; загрузка модулей, форма входа и транспорт не разделены, это не оценка production. Publishedexport/reviewimagefastpath не проверялся.

Один обычный reload в том же уже вошедшем context дал internalroomOpen920ms на Surface и2606ms на Samsung. Форма входа появляется при каждом mount по текущему design; внутренний таймер начинается после её подтверждения. Отчёты warm-loading сохраняют этот факт явно.

После проверок13 собственных disposable-комнат удалены обычным ownerAPI (HTTP200), приватные synthetic-auth каталоги удалены. Surface QAChrome/profile и SSHforward19334 закрыты; Samsung isolatedcontexts и наш ADBforward19335 удалены, основная Chrome-сессия сохранена. Vega QAChrome/profile/SSHforward19333 пока оставлены для продолжающейся матрицы другого агента.

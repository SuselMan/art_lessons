# Ограниченная проверка DITHER для #748

Старт только после аудита root и освобождения Vega. Исходники приложения не менять.

Вход: `docs/qa/runs/728-undo-v1-2026-10-16/final-disjoint-input.json`, исходные пять операций без изменения ID, времён, цветов, dabs, границ undo/dry. Бумага fine512². Для каждой из восьми комбинаций отдельная новая пустая disposable-комната и свежий browsercontext; операции вводятся локально как remote без сетевого echo.

Матрица: AMD Vega/Intel Surface × default/off × repeat1/repeat2. `addInitScript` оборачивает HTMLCanvasElement/OffscreenCanvas.getContext; off вызывает disable(DITHER) сразу при создании WebGLcontext, до возврата в engineconstructor. В default ветке состояние только читается. Проверить isEnabled до/после и после всех проходов.

`dither-case.cjs` читает после первых четырёх операций raw P/C/coverage/solvent и solver P/C/coverage в виде SHA256/размеров/channel sums. Затем применяет записанный dry и читает canonical dry live target через bakeNetworkSnapshot, без дополнительного fullReplay/oracle. Для repeat1 временно сохраняет target.bin; repeat2 ограничивается SHA. Framebuffer bindings восстанавливаются, GLerrors проверяются.

Сравнение: same-device повтор обязан быть побайтно одинаковым в каждом режиме; затем отдельно crossGPU default и off. Посчитать число отличий, максимум, число каналов >4/>16 и alpha. Отключение не объявлять исправлением, пока off не даст точное crossGPUравенство. Даже уменьшение ошибки не меняет approvedsolver.

Surface: новый собственный профиль `C:\ProgramData\grafetto\qa-night-dither-20261017`, remote9234→VPS19334, Chrome через Interactive ScheduledTask с SID вошедшего пользователя. До запуска записать launchPending/команду/owner/TTL в приватный resources.json; затем зарегистрировать фактический PID и удалить одноразовый ScheduledTask. Старые пользовательские Chrome и вкладки не трогать. Vega использует уже выделенный QAprofile/19333 после END другого агента.

После сравнения сохранить компактный JSON и минимальную diff-картинку только при необходимости; target.bin перенести в зарегистрированный disposable cache и удалить. Новые восемь комнат удалить обычным ownerAPI, синтетические auth удалить. Surface QAChrome/profile/forward убрать. Vega закрыть только после согласованного END всех его проверок.

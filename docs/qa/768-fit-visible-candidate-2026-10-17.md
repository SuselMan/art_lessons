# #768: Fit внутри видимой области

Изолированный candidate agents/768-fit-visible, base c8a9d09c.
Причина: viewport занимает весь editor, а docked chrome перекрывает его;
старые Fit/initialFit учитывали полную ширину, поэтому landscape canvas мог
оказываться за открытой правой панелью.

Изменение ограничено геометрией. Не меняет CSS, размеры панелей, layout,
инструменты, жесты или изображение. Четыре docked поверхности получили
невизуальные markers. Fit и initialFit измеряют текущие actual DOM bounds,
берут общую свободную прямоугольную область и её центр. Перекрывающиеся
левые колонки вычитаются по общей границе, не складываются дважды.

Minimal UI: header/toolrail/rightpanel не участвуют, но desktop quick-settings
остаётся видимой полосой62px и учитывается. Compactsidebar не смонтирован;
compactrail/quicksettings берутся из их фактического общего62px расположения.
Флаги hidden исключают поверхность сразу, до окончания opacity-transition.
Переключение панели само по себе не двигает камеру. Floating tool cluster,
поповеры и временные диалоги не превращены в новую политику автоматического Fit.

Rotation lock сохраняет угол; fitZoom по-прежнему берёт повернутый bbox и
старый .88margin. Infinite reset остаётся прежним origin/device-native zoom
по полному viewport. Zoom hotkeys, обычный zoom/pan и keyboard input не менялись.
Если docked chrome целиком закрыл viewport, сохраняется прежний full-viewport
reset, вместо zero/negative/NaN zoom: невидимой свободной области не существует.

Проверка:47unit в fitArea/cameraMath, включая landscape corners, rotated
bbox, минимальную полосу, overlappingdock, offsetviewport и hiddenDOMadapter.
Web typecheck, scoped oxlint --fix и git diff --check — PASS. Реального браузерного
скриншота здесь ещё нет: это candidate, не аппаратно подтверждённый UI fix.

Аппаратный список: desktop landscape+expanded sidebar Fit и initialjoin;
sidebarcollapsed/Fit; minimalquicksettings/Fit; locked45°/Fit; compact390px;
infinite reset; keyboard zoom и смена инструмента без самопроизвольного Fit.
Новые services/contexts/fixtures не создавались. Сохранён isolated worktree
и совместимые per-entry dependency links; shared output локальный build-кеш.

Аппаратная quarterturn-проверка нашла пропущенный header: он sibling body,
поэтому сканировать только viewport.parentElement недостаточно. Исправление
помечает outereditor data-canvas-fit-root и берёт closestroot; regression
моделирует header вне immediatebody и проверяет верхнюю границу при90°.
47unitPASS, scopedlintfix: только прежний Room useEffectdeps warning.

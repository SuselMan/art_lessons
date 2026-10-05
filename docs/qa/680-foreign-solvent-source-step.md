# #680: точный CPU источник V — первый шаг чужой воды

Commit исходного основания bb45c644; код 99a87ce2. Готовы два отдельных уровня: advanceSolventSource используется собственным RibbonStrokePainter с теми же формулами; assembleForeignSolvent — CPU reference, не подключён к engine rendering. Импорт foreignV по-прежнему выключен/отсутствует. Источники5296/5297/5313 не менялись, GPU не использовался.

Выделены water/pigment travel clock, refill только из recordedWet, политика legacy/finite/bottomless, load и исходная amplitude waterByDab. Собственный waterByDab получает ровно прежний результат; helper не вводит dwell или stencil как объём. Геометрия, реальные нибы, bands, pressure и halo пока остаются в painter и должны быть извлечены или повторно вызваны для настоящего source-only replay. Поэтому этот коммит ещё не улучшает чужую лужу.

CPU reference принимает уже растеризованные физические V массивы, а не бинарную влажную маску. MAX внутри gesture, ADD между gesture, существующий cap4; chunks дедуплицированы по ID. Повторный вызов создаёт новый временный результат и не мутирует доноров. Caller задаёт done и epoch после paper_dry/layer_clear; извлечение этих значений из OperationLog пока не подключено. Это доказательство арифметического контракта, не готовая history selection.

6 CPU тестов PASS: сравнение прежних формул при всех policy и segmentMode; равенство clocks/amplitudes на 1/3/7 chunks; recordedWet не возвращает pigment clock; bottomless не зависит от pigment; MAX/ADD/cap; duplicate/repeated calls; undone/old epoch/own source excluded. Web typecheck PASS. Проверка визуальных source-pass PNG потребует отдельного GPU слота после полноценного source-only rasterizer; CPU formula equality не объявляется GPU pixel parity.

Следующий шаг: переиспользовать тот же nib/band V draw в отдельную transient surface с сохранённым prevDab и source clock, выбрать источник по записанным контактам/порядку лога, не изменять P/C/coverage слоя. Физика испарения static V и двустороннее смешение двух P/C wash этим не решаются.

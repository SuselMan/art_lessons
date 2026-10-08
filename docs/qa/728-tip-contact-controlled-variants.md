# #728: следующий controlled A/B для редких щелей

Actual stamp Surface5f доказал: baseline P.B exact actual; nib255, hair около78/255, opening242–244/255, tip13/12/11 ведёт P.B к Q8нулю. Counterfactual без tip убирает три interior нуля, но отключение всей щетины не предлагается. Исторический reference OFF/default сохраняется.

## Кандидаты, пока план, не включённые формулы

**A — меньше закрытых волосков при сильном прижиме.** В shared wcTipContact менять только загруженный/high-pressure threshold0.34→0.28, оставляя light-pressure endpoint0.39, release endpoint0.62 и финальный pressure fade. На actual hair≈0.306 новый plateau smoothstep(0.26,0.30,hair) полный контакт; более низкие hair всё ещё открывают редкие щели. Geometric nibDistance/cov/AA/depth/opacity не меняются. Одна и та же функция применяется coverage/own water/P/C/stamps/ribbons. Не только пигмент: форма воды и краски остаётся общей. Это новая модель дозы и повышает оставляемую воду/краску в восстановленных контактах; conservation существующего transport kernel не доказывает conservation deposition. Не обещаем общую массу прежней.

**B — сделать opening более редким на полном прижиме.** High-pressure opening ramp(0.55,0.72)→(0.65,0.82), плавно возвратить исходный ramp при ослаблении нажима. Hair threshold оставить. Release endpoint и финальный fade оставить. Исходные rare глубокие щели сохраняются только в высоких noise peaks. Требует GPU контроля: эта функция wp медленно меняется, полосы могут стать менее частыми, но более длинными. Не объявлять B улучшением до moving stamp/ribbon кадра.

**Почему не ставим blind floor:** постоянный contact floor лечит Q8ноль, но уничтожает реальные сухие щели и рваный отрыв. Если исследовать floor отдельно, включать его только на мокрой/high-pressure кисти и одинаково для воды/P/C; текущая wcTipContact не принимает water, поэтому такой вариант требует явного нового shared аргумента/контракта. Не тихое изменение только amount/P.B. Фильтрация contact также может размыть край/залить dry gaps; она пока не первый кандидат.

## Малый paired gate

1. Literal reference + A + B на exact actual first stamp/noise/geometry/coverage. Сохранить Q8 baseline/coverage/PB/contact96²; first baseline должен снова совпасть с actual. Зафиксировать суммарную deposited воду/PB и площадь contact, interior zero count, gap lengths/rows, nib edge outside/distance. Не сравнивать только итоговый цвет.
2. Один короткий moving stroke, round400 (5–8 retained commands), exact CPU recipe/seed/pressure points, baseline/A/B. Coverage+P/C joint factor через literal shared function patch, не per-chunk noise. Дополнить pressure0.7→0.15→0 и water1→0 endpoints: release/dry исходные формулы должны остаться, edge/cap геометрия неизменна. Author/packed recipe детерминированность и отсутствие rectangular seams отдельно.
3. Actual rendering/baseline screenshots, затем Илья оценивает. Никаких production/default изменений, ON лишь diagnostic source specialization. Три arms serial; исходные source/paper/tape SHA и program patch SHA обязательны. Не запускать полный1536settle ради проверки локальной mask и не называть isolated лучшей всей акварелью.

Архитектурный принцип: единый contact support для воды и пигмента; дозировка меняется до transport, существующая масса лежащей краски консервативно переносится отдельно. Не выводить naturalness из арифметического PASS. Active historical settled snapshot — независимый незавершённый контракт.

## Исполняемый isolated packet

`build-held-variants.mjs <newImmutableDirectory>` собирает callable `runHeldStampVariants`: literal/A/B ×pressure0.7/0.1/0.02/0,36draws с тремя выходами amount/coverage/contact. Actual геометрия фиксирована; не переделывается radius при слабом нажиме. Это проверка функции pressure, не полная геометрия подъёма. Literal shader неизменен; A/B меняют только функцию contact для всех source phases. Результаты36×36864=1,327,104decodedbytes; GPUtexture бюджет~8.3MiB, staging48KiB переиспользуется, нет1536solver.

`held-variant-controller.mjs`: тот же ONE60с Surface1700/500, HTTPmanifest/SHA, exactpressure/order/budget, собственная страница. `analyze-held-variants.py <savedGate>` сохраняет ROI PB/water/coverage/contact карты, dose sum/delta, interior zeros/rows/critical pixels. Суммы строгоROI, не whole-stamp масса. До actual gate художественный вывод отсутствует. Source/golden8tests, strictTS, decoder3tests PASS. Lowpressure endpoints0.1/0.02 используют исходные параметры обоих вариантов; pressure0 полного отрыва должен оставлять0 для всех source outputs.

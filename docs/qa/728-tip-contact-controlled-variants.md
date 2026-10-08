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


## Actual Surface paired gate e61

Capture PASS,12arms/36fields, GPUerrors[], own page закрыта; pre2147.8MiB/post1943.9MiB. Raw `temp/fast-watercolor-night/held-stamp-variants-surface-20261008`. Literal pressure0.7 полный P exact предыдущему5f(actualPB exact). В ROI исходный PBsum504362. A добавляет4506PB/water units (+0.8934%),256изменённых пикселей/max49; B9580 (+1.8994%),465/max55. У обоих interior zeroPB3→0. Critical A8/7/6, B7/6/5 вместо0/0/0. Coverage sum reference1915613→A1941872/B1970134. Это изменение контакта/дозировки, не потеря массы transport.

При pressure0.1/0.02/0 PB exact literal для обоих вариантов. All36RGBA comparison low endpoints отдельно подтверждается hashes; pressure0 PB полностью0. A выбран для следующего диагностического moving proof как меньшее вмешательство/меньшая прибавка дозы, **не художественно лучший вариант**. Геометрический nib edge не менялся; отсутствует доказательство full-stroke naturalness/dry/replay.

## Source-only moving wrapper подготовлен

`movingContactRun.ts` callable `runMovingContactVariant('literal'|'A')` использует exact CPU prepareCanonicalStrokeChunk по8явным canonical dabs, actual CanonicalSourcePhaseExecutor/PlanAdapter mode1, separate film/base/coverage/P/C, **без settle и presentation**. Context-owned GPUDevice facade специализирует только stamp/ribbon `fn paint` shaders; глобальные WebGPU прототипы не меняются. Backend private constructor вызывается Reflect.construct только в QA для собственного device/facade; это не новый публичный backend API. Native source state и Q8pass границы сохраняются. Actual paper не участвует в этом source-only gate; flat1² нужен resource owner, noise literal251².

Результат — actual final source P/C/coverage ROI384×192(272,352),884736decodedbytes/arm, original CPU command SHA одинаков literal/A. `build-moving-contact.mjs` и `moving-contact-controller.mjs`: дваserial arms, между нимиRAM1700, abort500,60с each, собственнаястраница. Это не livePointer/Room/finishing/морфинг/производительность. Hand-authored canonical fixture явно не исходный user stroke, pressure0.1/0.02/0 и фиксированныйsize400 isolates factors; combined/segmentedCPU recipebytes PASS. Source-only GPU wrapper ещё не проверен аппаратно; ошибки bindings/driver остаются возможны. Оценка whole material массы не делается по ROI; фиксировать ROI дозу и gap рисунок, не обещать conservation reference deposition.

Hosted9a HTTP manifest/run.js/index.html SHA и bytes проверены, sourceHEAD9a6724ed. ONE software smoke завершён за bounded45s без full1024fields: literal/A stamp+ribbon modules и12render pipelines compiled, messages/errors[]. Это compile/layout smoke, **не source orchestration или hardware качество**. Изначальная версия9a source wrapper остаётся immutable; следующий wrapper cleanup гарантирует device.destroy также при constructor/setup throw, отдельно tagged source. `analyze-moving-contact.py` проверяет same-command SHA/ROI/payload SHA и пишет per-channel sums/deltas/differences/grayscale; same-model exact для A не ожидается. Controller уже READY, между arms проверяетRAM1700, nonemptyApatch required. До аппаратного gate выводов о moving картинке нет.

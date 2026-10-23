# Эллиптический support9: статический причинный аудит

Фактический V5: исходная coverage A>.5 37915 пикселей; после front 37937 (+22, .058%), bbox неизменен [957,836,1220,1022]. Изменены 1349 AA-пикселей, но только A; standingB не меняется. Final coverage byte-identical front. Это не доказательство отсутствия front: он достигнут, но почти не расширяет полную область.

WatercolorSettlePlan.ts:380: film seed cost=(budget−1)/costMax. shaders.ts mode10: EVERY source carrier a.a>.003 seeds film, irrespective standing; only deep standing lowers seed toward0. Таким образом MAX full-pose union поддерживает исходный эллипс и поздние почти сухие положения также дают film seed. Mode11 max(oldCoverage,inside) принципиально не может разорвать/сузить уже записанную область.

WatercolorSettlePlan.ts:529: carry eligible cost cutoff=(budget−1.5)/costMax. Обычный film seed (budget−1) > cutoff на .5cost, то есть обычная плёнка не входит в carry domain. Это бинарное исключение, а не малый carry gain. Перенос из deep seed может проходить только туда, куда cost стал меньше cutoff; стоящая плёнка не гарантирует этого.

Внешний шаг front стоит минимум dryCost*.85, dryCost>=24 =>20.4 cost. Film оставляет всего1cost budget. Поэтому максимальный обычный film front вне support <1/20.4 клетки, значительно меньше AA. Рельеф/climb не может создать массивные наружные лепестки без отдельного глубокого seed. При budget>=48 dryCost>=budget*.5, доступный запас1 становится ещё меньше. При такой постановке увеличение самого budget также увеличивает seed почти настолько же, а не даёт film новый свободный путь.

Необходимое различие: photo9 контур нельзя требовать как равный записанному пути — аппаратные дabs уже дают эллиптический union. Внутреннюю массу можно менять без изменения coverage; фотоподобный наружный контур потребует разрешённого мокрого receiving domain за исходным union, а не произвольного screen warp.

## Диагностический контроль, не production предложение

Один доступный runtime module replacement carry cutoff budget−1.5 -> budget−.5 (exact opts.band expression only), оба paired modes15/16 используют те же opts. Это бинарно разрешает carry в обычном film seed без изменения seed/front/standing/support/source/новых текстур. Предсказание: если центральная однородность вызвана исключением обычной плёнки из carry, внутренние поля P/C изменятся при coverage byte-identity; внешний support останется почти эллипсом. Если эффект отсутствует, причина не эта недоступность либо выбранный carry не переносит достаточно.

Риски: исторически ring исключён намеренно против жёсткой каймы; новая cutoff может вернуть краевую концентрацию. Не выдавать за победителя, оценивать источник→послеcarry и coverage, не только finalPNG. Это не новый grant amplitude sweep: изменяется достижимость ordinaryfilm для существующего оператора. Не комбинировать с changed source/optics.

Другая содержательная диагностическая ветка (только план): задавать отдельный dry-paper film budget как seedCost+runDistance*dryCost с реальным локальным запасом воды. Но текущая standing запись почти везде1code, source P.r/A отличается от свободной воды; физически вывести runDistance из этих данных пока нельзя. Простая seed0 на всей coverage даст искусственное растекание пустой поздней кисти и повторит отвергнутый globalwet подход.

## Последующая фальсификация предложенного контроля

Cutoff-only диагностический вариант отклонён ДО GPU. wcCarryWeight требует положительный gradient d=(cj−ci)*costMax>1e−3; внутри captured9 ROIs cost совершенно плоский (code217). Actual mode11.d production baseline, costMax33.9088/budget29.9088: все 3 ROI16×16 имеют только217, cross351×1 только217/255. В 3580 внутренних направленных соседних рёбрах stock/proposed eligibility=0, сумма весов=0. У exterior217→255 gradient положительный, но receiver255 выше обоих cutoffs. См. cost-edges.json.

Таким образом cutoff−.5 не способен включить внутренний carry в этих регионах. Мои первоначальные слова «бинарный барьер» описывают лишь необходимое условие, не достаточное. Нет wholefield cost capture parent22, поэтому нельзя экстраполировать нулевой flux на ВСЕ возможные deep seed периферические регионы. Spec не создан; GPU не нужен.

# Точная геометрия столбцов: CPU-прототип

Прототип `BrushDragColumnMemo.ts` не подключён к движку. Он сохраняет исходные суммы, деления, квадрат, `Math.exp`, порядок накопления Float32 и Q8 округление. Две Float64 таблицы на dab хранят `px*c` и `-px*s`; продукты `py*s`/`py*c` вычисляются один раз на строку. Деление не заменено умножением на обратный радиус. Никакие вклады перекрывающихся dab не пропущены.

На той же приватной фактической записи OFF комнаты `6pbY2G4A` оба stroke имеют 104 packed dab, 31 drawable, 30 travel, 14 contact groups. Полная идентичность ID/strokeId/tool/layer/actor/preset/color/packed/wet проверена прежним gate. Все 30 ordered canonical flow upload SHA/dimensions совпали с сохранённым аппаратным эталоном. Это проверка producer payload, не новый аппаратный или foreign-stencil тест.

64 фиксированных случайных +36 adverse случаев (signed zero, finite extreme scale, angle, water0), неизменённый generator oracle и независимость retained output при reuse workspace прошли. Float64 не уменьшает точность JS number. Таблицы выделяются отдельно для каждого dab; их цена включена в benchmark.

Повторяемый CPU runner: `QA_CONTACT_COLUMN=1`, опционально `QA_CONTACT_REFERENCE_HOIST=1`; обязательны явные приватные `QA_CONTACT_INPUT` и новый `QA_CONTACT_OUT`. Новый output не перезаписывается. Текущий реальный runtime `diagnosticReuseFlowRaster=false`, wiring отсутствует; этот benchmark правильно использует no-workspace default. Counterfactual workspace не выдаётся за текущий путь.

Медианы warm по 8 чередующимся samples после двух warmup раундов, два stroke вместе:

| Reference | Reference ms | Memo ms |
|---|---:|---:|
| Original, повтор1 | 21.46 | 19.85 |
| Original, повтор2 | 21.59 | 20.33 |
| Existing hoist, один повтор | 21.29 | 19.15 |

Cold три отдельных процесса на arm: original median79.53ms, memo69.99ms; samples существенно шумят (memo66.13/69.99/88.87), поэтому это не надёжный прогноз cold UP на Surface. Warm также подвержен JIT/нагрузке VPS. CPU выигрыш 6–10% мал; runtime/default/пользовательский стенд не изменены, нового device run не запрошено. Значительных задержек опыта этим пока не объяснить и не устранить.

Компактные samples сохранены в `contact-column-cpu-summary.json`; raw stroke fixture остаётся приватной вне Git. App typecheck и targeted oracle tests проверены. Следующее полезное направление требует уменьшить число точных source/contact passes или цену существующего publication pipeline, а не приблизить exponential.

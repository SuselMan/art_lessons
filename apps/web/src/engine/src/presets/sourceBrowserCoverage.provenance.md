# Browser Number coverage

Профиль browser-number-coverage-v1 использует существующие bounded scalar streams default circle/rect, Gaussian и soft. Ordinary mul-add выбирается один раз при prepare; NEON/native ветки остаются отдельными. Gaussian переиспользует rational erf polynomial, но выбирает Math.exp; coefficients также имеют явный browser режим, default сохраняет native. Trusted source/compiler/table identity остаётся данным источника и не означает native arithmetic attestation.

Новый route browser-number честно отличается от scalar/native. Source geometry cache identity включает coverage; stripes, work budget, cancel и AA sample counts используют прежний evaluator. Wholeprofile executor/constructor/policy этим CPU unit не включаются. GPU unit независим и должен выбрать новый явный профиль; старые shader/native exports не заменяются.

Tests-first: три ожидаемых отказа нового coverage → pass. Native/regression: 61 тест/9 suites; затем 61 тест/3 suites с whole Gaussian coefficient preparation, prepass и коэффициентами. Browser tests проверяют отсутствие вызовов native FMA32/FMA64, stripes==one-shot, soft retained table, AA9, budget/cancel, Gaussian known erf values/симметрию/монотонность и раздельный cache identity. Прежние native mask goldens не обновлялись.

Журналы: temp/device-runs/krita-stroke-20261024/fixes-v52/browser-cpu-*. Hardware/UI smoothness этим host unit не доказаны; ресурсов/процессов устройства он не создаёт.

Итоговый общий app+SW TSC99580: PASS; включает замороженный CPU11 и согласованные GPU/cancel/Room units. Browser new suite7 PASS, final lint/diff PASS.

# Диагностика края линейного carrier, CPU

Это два описательных измерения alpha исходного RGBA8 carrier, не художественная оценка и не regression threshold. PNG, гамма, цвет отображения и порог выделения пятна не используются. Растекание само по себе может быть правильным: цель — проверить гипотезу о числе exchange-проходов macro25 на одинаковом входе.

Пусть A=alpha/255, S — два separable прохода [1,4,6,4,1]/16 с CLAMP по краям, E — сумма квадратов горизонтальных и вертикальных соседних разностей. Внешняя граница изображения не добавляется как скачок к нулю.

1. `edgeWidthPxProxy = max(S(A)) * sum(abs(gradient(S(A)))) / E(S(A))`. Единицы — пиксели. Больше означает более пологий эффективный переход. Это **не** измеренная ширина 10–90% и не выделенный внешний контур.
2. `fineGradientEnergyFraction = 1 - E(S(A))/E(A)`. Высокая доля указывает на мелкие изменения, подавляемые фильтром: ими могут быть и резкий край, и бумажная зернистость, и dither. Это предупреждение о смешении факторов, а не показатель качества.

У постоянного изображения обе величины null. Геометрия, пальцы растекания, внутренняя текстура, относительная плотность частей мазка, обрезка и изменение максимальной alpha влияют на результат. Нормировка устраняет только общее умножение alpha. RGB и цветовое смешение этими метриками не оцениваются. Сравнивать нужно совместно с изображениями и массой, не оптимизировать одну цифру.

## Синтетический oracle

`node --test docs/qa/prototypes/805-algorithm-search/carrier-edge-metrics.test.cjs`: 5 PASS. Резкий диск и радиальные переходы 8/16 px дают proxy 4.667 / 11.950 / 21.996, fine fraction .786 / .115 / .059. Проверены монотонность линейных переходов, zero/uniform, поворот и масштаб alpha, зернистый контрпример и CLI/SHA. Это CPU-проверка формулы, не GPU-тест.

## Три actual входа, 1024²

| Вход | Вариант | Proxy, px | Fine fraction |
|---|---|---:|---:|
| mini-wave | input | 27.83 | .380 |
| | native original, converted common | 17.17 | .518 |
| | fine12 | 54.76 | .983 |
| | Lite | 77.88 | .185 |
| sheet3 slot1 | input | 8.14 | .511 |
| | native original, converted common | 55.58 | .797 |
| | fine12 | 65.17 | .980 |
| | Lite | нет сохранённого raw | — |
| sheet12 slot1 | input | 11.96 | .503 |
| | native original, converted common | 12.40 | .711 |
| | fine12 | 33.93 | .950 |
| | Lite | 30.89 | .537 |

Fine12 и Lite: steps256, mobilityGain3, eddyCells16, curlStrength128; fineSteps12/paperGain3 для fine. Входы сверены по всем commonSHA RGBA/water/paper, raw — по decoded SHA, pass/repeatExact; у native взят original transport.rgba с conversion.clippedChannels=0. Fine12 имеет большую мелкочастотную энергию одновременно с широким proxy: один градиентный показатель мог бы спутать зерно с резкостью края. На sheet3 native сам даёт широкий proxy: считать любое размытие дефектом нельзя. Различия формы и итоговой массы остаются конфаундерами.

Источники: native-all13-endpoints-results/native-batch-report.json; functional-v17-mini-valid-results/report.json; functional-v17-actual-results/report.json; functional-v19-fast-abba-results/report.json. Компактный приватный расчёт с SHA источников/входов/carrier: registered cache flow-805-night-20261018/carrier-edge-metrics-actual.json. Новых GPU чтений и запусков не было.

CLI: `node docs/qa/prototypes/805-algorithm-search/carrier-edge-metrics.cjs carrier.rgba.gz 1024`. Для macro25 следует сравнить одинаковый carrier-вход и конфигурацию, сохранить обе метрики, массу и визуальный контроль; заранее заданного критерия выигрыша здесь нет.

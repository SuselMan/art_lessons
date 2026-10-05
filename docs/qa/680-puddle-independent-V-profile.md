# #680 — frozen profile кольца при independent V

База диагностического runtime5296: `c3b128ec`. Source не изменялся. Операции
316–318 комнаты `1oHTHv2x`, все с washId `T6f-47HWPi`, последовательно.
Обе matched variants используют painter flags: `combined`, `record=true`,
`fluid=true`, `landingReservoir=true`, `landingPolicy='fluid'`; только
`solvent=false/true` различается. Это static V внутри одной wash, не новый
решатель фронта и не перенос V чужой комнаты/другой wash.

Настоящая Vega: оба ограниченных диагностических прогона прошли GL0,
contextLost=false. readPixels читает один buffer порциями64 строки, наружу
сохраняется только30×60 RGBA ROI и scalar статистика. Отдельный предыдущий
прогон основного агента с большими base64 dumps завершился Target crashed;
причина не доказана. Успешный bounded capture не подтверждает надёжность всех
тяжёлых рисунков в production.

## Источник и carry

В обеих matched variants total P имеет четыре одинаковых канала (сумма1929828),
fixed=0, mobile=total. На split/prefront/precarry b>a нарушений нет. В отличие
от legacy исходного сравнения, чистая вода уже не сидит в pigment carrier;
это происходит в combined/record пути и без V. Нельзя приписать восстановление
этого source инварианта исключительно solvent toggle. Source отличается также
по дозе от legacy, поэтому legacy→combined не является изоляцией одной переменной.

P-before ROI SHA совпадает между variants:
`39bc92959a3f888a904db9d66964afa528b9623cb5fd92f99543252713a7e422`.
P-aftercarry тоже совпадает:
`464544aeb6618d7509eb4ba5e972caa7ef8370faa5cb01bdb58c48334f180d6f`.
14 carry steps; суммарно P-after1925644 в каждом канале. V ещё не меняет
этот carry. В исходном total44 saturated pixels, после carry0.

## Светлая линия после смешивания

Среднее y290..294 на левой линии x261:

| Поле | Combined без V | Combined с V |
|---|---:|---:|
| P.b до carry | 49.8 | 49.8 |
| P.b после carry | 22.6 | 22.6 |
| Final P.b = C.a | 47.4 | 72.0 |
| Final C.g | 13.0 | 20.0 |
| PNG luminance | 184.6 | 164.6 |

C.g/C.a и C.b/C.a сохраняют цвет; coverage.a не создаёт эту линию. Контраст
luminance линии к среднему соседей x260/262 падает примерно23.7→8.5 codes
(-64%). Провал pigment mass к тем же соседям29.9→12.1 codes (-60%). Это
заполнение реального pigment/optical-depth valley после carry, а не только
маскировка в composite. Слабая граница ещё видна; полного решения не заявляем.

Перенос не прекращается: площадь PNG при R-G>20 растёт21487→22185px (+3.2%),
bbox практически одинаковый [235,208,401,377] / [235,209,400,378]. При R-G>40
площадь19886→21114, при >80:15659→16978. В отличие от отвергнутого изменения
conductance, эффект не куплен уменьшением всего ореола.

Final integrated P.b1901553→1901092 (-0.024% к off). Max198→175: распределение
становится ровнее, поэтому preservation всех отдельных пиков не утверждаем.
От исходного source до final есть RGBA8 mass drift примерно−1.47%/−1.49%;
универсальная conservation не доказана. Final C.a равен P.b, C.rgb<=C.a,
никаких b>a в final P. V max192codes=3.01 units, saturated0; field V и final V
имеют одинаковую сумму3144094 в r/a: это статический reservoir, не перенос
жидкости. Его fringe и чужие wash ещё не обслуживаются общей моделью.

Артефакты `temp/carry-normalization/V-frozen-stage/{report.json,profile.json,
profile-console.txt,*-crop.png,*.raw}`; воспроизведение
`V-frozen-stage-qa.mjs`, `V-puddle-cases.json`, `profile-V-frozen.mjs`.
Пользовательские страницы и runtime source не менялись; своя QA вкладка закрыта.

## Ядро и зерно

Matched side-by-side: `temp/carry-normalization/V-frozen-stage/matched-ring-compare.png`.
Визуально V делает ядро немного ровнее и светлее, но мелкое зерно остаётся;
явной мутной размытой фактуры в этом crop не видно. Это художественная оценка
одного повтора, а не принятие пользователя.

В центральном диске R28 около(319,292),2449 pixels, mean R-G158.41→153.93
(-2.8%), standard deviation7.98→7.81. High-frequency RMS chroma residual от
среднего3×3:4.56332→4.56297, mean horizontal chroma gradient3.518→3.493.
Мелкий контраст практически не потерян. Метрики включают влияние бумаги и
не доказывают сохранение каждого пигментного пятна или всех других листов.
Артефакт `core-grain-metrics.json`; max198→175 всего поля нельзя трактовать как
меру размытия центрального зерна.

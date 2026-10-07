# CPU-кандидаты акварели: 7 октября, 23:47

Основание `f7dc9c3d`. Данные графа указали тяжёлый `_paintDabs` (около239ms собственных instrumented затрат за50вызовов); CPU samples также выделяли geometry и `_updateWetTexture`. Это не GPU duration. Изолированное Node CPU-ядро не доказывает такую же экономию времени полного штриха на планшете.

## Принятые для аппаратного A/B кандидаты

`32082bd1` + `55890fb8`: исходный `number[].push` и финальная конверсия заменены непосредственной записью Float32 vertices. Все geometry/material вычисления остаются в JS double, encoded values не читаются обратно. Сохраняются количество/порядок треугольников,11полей,GLdrawgrouping. Capacity reserve производится на segment; marker без fillEveryPose не резервирует лишние тела. Возвращаемый буфер точно обрезан, не удерживает избыточный backing storage.

Node A/B старого кодаf7 против typedwriter **без trig cache**,5медианных trials с чередованием порядка,3материальных прохода:

| Сценарий | ellipse, было→стало ms | roundedBox, было→стало ms |
|---|---:|---:|
| Реальные последние8дабов из записанного Samsungfixture |32.01→8.05|31.00→6.82|
| Синтетическая плотная round400дуга |31.07→4.70|31.14→5.33|
| Синтетические turning400/pressure/chisel |185.81→39.23|179.50→33.24|

Каждый вызов генерирует3Float32 arrays, побайтово равные старому коду. Полные trials — `typed-geometry-node.json`.6сценариев включают film/fillEveryPose; это не измерениеFPS.12дополнительных goldenSHA256cases зафиксированы по старой реализации для pressure, pose, zero-travel, size0,2форм и3масштабов. JSON сериализует−0как0; baselinegolden вычислены по уже сериализованным входам, а не по исходным JSлитералам. Отдельный outline Float64test проверяет signedzero напрямую.

`e2baba02`: display overlay получает независимые water/pool raster одним mapwalk вместо двух. `_decayed` чистый и вычисляется один раз наcell. Max/update порядок каждого канала и Float32 промежуточные записи прежние; NaN predicate сохраняет старую семантику `rasterPool`. Canonical PaperWetness не меняется.

На80deposits,162×162output,7чередующихся trials×100calls:20.07→10.02ms. Побайтово совпадают оба Float32outputs. Полные trials — `paired-raster-node.json`.

## Проверки

-76tests/4geometryfilesPASS до capacity followup,68tests/3geometryfilesPASS после него.
-37tests/3paperfilesPASS,22engine/painterintegrationtestsPASS.
-Web typecheckPASS, selectedlintPASS, diffcheckPASS.
-Устройства/публикации этим агентом не выполнялись. Полную аппаратную проверку делаетroot.

Обязательный аппаратный gate: одинаковые канонические операции, vertexbytes/ordereddraws,field/material/fullRGBA exports, live→replay/undo/redo, round/chisel/small/400 и next-touch; отдельно рамочное время, начало штриха и naturalcompletion. Дляoverlay: мокрое/сухое/лужа, multilayer/pending, camera/zoom, contextrestore; GPUcanonical result должен остаться тем же.

## Исключённые варианты

`b0271427`, cache16точных trig directions, CPU bit parityPASS, но медианы не дают устойчивого ускорения (один кейс хуже). **Не принимать ради скорости**; он не нужен двум другим кандидатам.

Формулы не переассоциировали, Math.hypot/exp не заменяли приближениями, contacts не прореживали и не переставляли, resolution/iterations не уменьшали. E-graph/SMT не запускали: доминирующая найденная издержка — представление и повторные обходы, а не известная алгебраическая эквивалентность Float64 выражения.

Рабочие harness/rawbaseline: `temp/cpu-paint-opt/geometry-typed-isolated-bench.ts`, `markerRibbon-baseline.ts`, `markerRibbon-typed-isolated.ts`, `paired-raster-bench.mts` в этомworktree. Первый чрезмерно длинныйbenchmark был остановлен по точным собственнымPID; опубликованные trials относятся к короткому завершённому прогону.

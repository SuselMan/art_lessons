# Фактура carrier и связь с исходной бумагой

Read-only CPU descriptor по сохранённым RGBA carriers, не по PNG. Высокочастотные остатки: A−box(A,r), P−box(P,r), r2/4. RMS(Aresidual) делится на среднюю A внутри общей маски; Pearson корреляция центрирована. Отрицательная корреляция означает больше carrier alpha в более низких значениях paper height на этих масштабах, а не универсальную «правильную акварель».

Параметры выбраны до просмотра значений: envelope baseline box8, threshold8/16byte, erosion12pixel, обрезка границ. Для всех mini сравнений одна fixedfine0mask и ровно одинаковые counts219901/213894. Микродырки не исключаются отдельно по candidateA: в маске остаются нули кандидата. JSON сообщает их долю. Порог не подгонялся под результат, grid8метрика не добавлялась.

## Mini-wave: один и тот же input/paper

All3planeSHA совпали между исходным native capture, V15 и новым original endpoint. SHA carriers проверены при чтении protected gzip, conversion endpoint clipping0, исходный pigmentScale0.6781914894 сохранён. Никаких GPU чтений/повторных вычислений/изменения PNG.

| Состояние | r2 normalized RMS | r2 correlation paper | r4 normalized RMS | r4 correlation |
|---|---:|---:|---:|---:|
| INITIAL actual native converted carrier | .03884 | +.00342 | .07646 | +.00259 |
| Original native converted endpoint | .02476 | −.00695 | .04080 | −.00506 |
| New smooth fine0 | .00365 | +.00290 | .00476 | +.01832 |
| New fine12 gain0 | .00361 | +.00381 | .00467 | +.01884 |
| New fine12 gain3 | .13680 | −.91185 | .13605 | −.87332 |

Это threshold8; threshold16 оставляет вывод: gain3corr−.91346/−.87510, native endpoint−.00473/−.00294. Средняя A внутри маски уfine0/gain0/gain3 практически одна116.72,116.72,116.72, поэтому рост normalizedRMS не объясняется уменьшением знаменателя. Native mean115.61, initial121.65.

В этой сцене добавленная gain3 фактура сильно связана с реальной input paper, а не независимым белым аэрозолем. Но связь НАМНОГО сильнее оригинального native response и RMS существенно выше: это может оказаться слишком навязчивым зерном. Метрика не выбирает художественного победителя. Маленькая native корреляция не доказывает отсутствие бумажной физики: другие масштабы, процедурный шум, нелинейный отклик и перенос легко разрушают простую локальную линейную корреляцию.

Native endpoint содержит0.307%нулевойalpha внутри общей mask8 и0.006%mask16; initial0.601%/0.037%. Таким образом, zero/background inclusion квалифицировано, а counts не подменялись между вариантами.

## Дополнительный контекст

Два небольших native-flow endpoint имеют собственные ROI и другие сцены. Pooldrop r2RMS.1145/corr−.0143; separatedRMS.0369/corr+.0019 приmask8. Их нельзя численно ранжировать против большого mini: другая форма, исходная плотность, ROI и water domain. Отдельный JSON сохраняет оба порога/counts.

## Воспроизводимость и ограничения

`carrier-grain-diagnostic.cjs` — чистый CPU descriptor; `carrier-grain-report.cjs` — read-only SHA-verified artifact reader.4CPU теста: constantcarrierexact0+undefinedcorrelation, smoothshape≪seededwhitegrain, independentwhitegrain≈0corr, paper-linkedsyntheticnegativecorr<−.99, flatpaperundefined, fixedROI/blankmask. Код не импортирован в UI/worker/runtime.

JSON evidence: carrier-grain-v15-mini, carrier-grain-native-mini, carrier-grain-native-flow. Содержат input/carrierSHA и полный descriptor; raw/gzip/paint не копировались в Git. Сервисы/процессы/устройства не создавались. Граница8bit, box radii и threshold — исследовательские настройки, не художественные пороги допуска. Static grid/edge artifact, направление струй, цветовое смешение и приятность края эта метрика отдельно не доказывает.

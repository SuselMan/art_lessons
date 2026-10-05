# #324: отделить canonical export от мокрой презентации

Основание bb45c644, исправление 743adafd. Production/push отсутствуют. Во время независимого spiral capture домашний SSH временно не отвечал; новые Chrome до освобождения слота не запускались. После завершения того capture исправление проверено на настоящей Vega.

## Исправленная диагностика

Предыдущая native/rebuild разница в PNG не доказывала изменение canonical P/C solver. Source-ab.mjs вызывал watercolorDryAll, ждал только settle/opqueue/rebuild и сразу exportPNG; reveal продолжался ещё 2 секунды. Exporter.buildContentComposite использовал общий drawLayer. Его LayerCompositor.drawCompositeItem безусловно подмешивал текущий washReveal. Поэтому экспорт измерял представление, а не только материал слоя.

AB на неизменённом исходнике:

| Вариант | Что остаётся при native finish=true | Native/append PNG различие | GL |
| --- | --- | --- | --- |
| nodisplay | prepare preview + pending composite, без синхронного display callback | 7510px, max98, mean.01532 | 0/0 |
| noop callback | prepare реконструкция, callback пустой | 7511px, max110, mean.01911 | 0/0 |
| noprepare | native reveal allocation, preview аргумент undefined | 7505px, max106, mean.01903 | 0/0 |

У nodisplay/noprepare все 7 исходных ROI полей byte-exact между native/fresh append. У noop inkLoad/strokeInk не совпали, поэтому его нельзя использовать как точную причинную пару. Остальные пары опровергают преждевременный вывод, что сама progressive реконструкция портит solver: без неё mismatch экспортного представления сохраняется. Mean посчитана по всем RGBA каналам 2000x1200 PNG. Пары имеют разные native timestamps/геометрию, сравнивать pixel difference между вариантами как точный ranking нельзя.

## Код

Только exporter drawLayer передаёт includeWashReveal=false в LayerCompositor. Экранный default=true остаётся. Экспорт не ждёт таймеры, не sweep-ит и не отменяет animation, не записывает P/C/V и не меняет material target. Общий compositor продолжает выполнять то же отображение канонических tiles, opacity и frame.

Unit index.watercolor.test.ts: exports canonical tiles without stopping the on-screen wash reveal. Проверяет, что экран вызывает drawReveal, offscreen export composite его не вызывает, и map/объекты reveal сохранены. PASS; web tsc PASS. Это routing/lifecycle proof, не real shader PNG proof.

Реальная Vega: обычный native finish=true, затем fresh append тех же записанных операций. Экспорт patched path при всё ещё активном reveal: source7ROI byte-exact, GLnative/append0; остаток PNG **463px/max10/mean.00036625** вместо примерно7505px/max100. Это подтверждает, что большая прежняя разница была экспортом transient представления, а не доказанной порчей material solver. Exact native parity не заявляется: float32 geometry/quantized recorded-dab остаток отдельно не локализован. Chrome закрыт finally, GPU освобождена. Изменённых shader programs нет.

Артефакты temp/policy/source-ab-canonical/{report.json,metrics.json,native.png,after.png}; source/index.ts и LayerCompositor.ts на home совпадали по SHA256 с 743adafd перед запуском. Экранное движение подтверждено прежним morph QA; routing unit доказывает, что этот patch не отключает on-screen reveal. Отдельный real moving-frame proof этого export-only изменения и Samsung native export smoke ещё не сделаны.

Артефакты own temp/policy/source-ab-{nodisplay,noop,noprepare}/report.json + PNG/raw; harness source-ab-canonical.mjs подготовлен. Home5316 update sync завершился; оба изменённых source-файла сверены по SHA перед реальным запуском. Ни5297, ни5313 не менялись.

## Проверка основной рабочей копии и Samsung

Root7fdcc459 сохраняет делегирование через _drawCompositeItem с optional
includeWashReveal и исправляет ExportRect теста (width/height). После извлечения
advanceSolventSource его segmentMode передаётся как boolean (!!). Настоящая
проверка `npm run typecheck --workspace @grafetto/web` прошла; canonical routing
regression unit прошёл после исправления типов. Ранние сообщения о typecheck PASS
для743/99a не подтверждали эти три ошибки в app-конфигурации.

Samsung5316, runtime743: native один короткий штрих, Dry, экспорт при reveal map1,
undo/redo и полная перерисовка. GL0 до/после undo/redo и в конце, contextLost=false,
26 salted cold links/0 failed. Экспорт сохраняет reveal map1. Native canonical
PNG против rebuild:525 pixels, max12, meanRGBA.0003915625 на2000×1200; exact
parity не заявляется. Redo против full rebuild byte-exact. Случай очень маленький,
не доказывает память/плавность больших рисунков.

Две экранные выборки этой harness дали frameChanged0, поэтому это НЕ новое
доказательство живого движения и не новая диагностика его регрессии. Routing
unit и предыдущий полноценный morph QA отделяются от этого export smoke.
Своя QA вкладка закрыта, forward9233 снят. Файлы roottemp/wc-runs/own-water/
native-export-{samsung.json,samsung-metrics.json,before-samsung.png,after-samsung.png}.

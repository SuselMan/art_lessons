# #324: отделить canonical export от мокрой презентации

Основание bb45c644, исправление 743adafd. Production/push отсутствуют. GPU verification исправления пока не выполнена: во время независимого spiral capture перестал отвечать домашний SSH. Новые Chrome не запускались.

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

Следующая проверка при доступном GPU: то же native+freshappend source-ab с обычным finish=true, экспорт patched path при ещё активном reveal; отдельно raw canonical tiles. Проверить phaseGL0, source7ROIexact, residual native/replay PNG и экранное движение; Samsung salted compile не требуется для этого изменения shader-free, но native undo smoke полезен. Не обещать exact native parity до измерения float32 geometry остатка.

Артефакты own temp/policy/source-ab-{nodisplay,noop,noprepare}/report.json + PNG/raw; harness source-ab-canonical.mjs подготовлен. Home5316 update sync начат до потери SSH, его завершение и актуальность source пока не подтверждены. Ни5297, ни5313 не менялись.

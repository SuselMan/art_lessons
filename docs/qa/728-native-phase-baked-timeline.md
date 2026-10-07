# #728: живые кадры phase+baked после отрыва кисти

## Проверенный сценарий

Vega, отдельный настоящий PointerInput движок 640×480 Fine; immutable HOME frontend cbe526527ca3d39a53ed61850d310abafd4f338a, 966 файлов web/shared по source-passport. SourceRebase включён в обоих вариантах. OFF: phase/baked выключены; ON: обе опции включены, baked texture прогрета до ввода. Исходники и формат операций не менялись.

Сначала вода normal100:0 PB29 round размер220; затем пигмент normal100:100 размер80, три небольших витка. OFF записал реальные callback аргументы PointerInput; ON исполнил тот же tape. Packed dabs, wet, preset, color, strokeId и washId двух native журналов совпали. Только метаданные идентификаторов фиксированы в диагностическом seam до первого dab, чтобы случайный seed не смешивал сравнение. Серверные ACK и multiplayer этим standalone сценарием не проверяются.

Контроль drawable layer, paper loaded, gl.canvas===ownCanvas и preserveDrawingBuffer=true пройден. ON достиг 30 actual phase calls с actual solvent и 8 baked fibre calls; оба GL0/contextLost=false. Собственный Chrome закрыт finally.

## Результат и пределы

Сохранены live presentation crops 384×384 до отрыва, сразу после и на100/250/500/750/1000/1500/2000/2750мс. Реальный paper_dry вызван после кадра750мс (OFF766.5мс, ON769.8мс). Reveal присутствовал сразу после отрыва, завершился к final-visible. Canonical PNG экспортирован только после idle.

В OFF светлое замкнутое кольцо проявляется во время ускоренного высыхания; ON убирает его, центр становится мягче, наружное растекание сохраняется. Уже кадр100мс отличается от after-lift: ON12700 изменённых пикселей crop; это не полностью неподвижная пауза. До Dry750мс визуально движение очень мало, крупный рост приходится на1000–1500мс. Ненулевой pixel count не доказывает заметное плавное растекание. Естественный переход без Dry4–6сек остаётся отдельной необходимой проверкой.

Явные треугольные грани не воспроизвелись ни в OFF, ни в ON: устранение кристаллов этим опытом не доказано. Это совместная phase+baked визуальная проверка, не разделение причин двух опций, не полный KJ prefix, не crossGPU и не измерение производительности. Снимки canvas выполнялись во время диагностической волны; временные метки отражают реальную задержку captures, не benchmark.

Первый запуск INVALID до ввода: standalone не создал layer buffer. Сохранён отдельно, не является отказом движка. Исправленный повтор использовал публичные setBaseLayers/setCompositeOrder.

## Артефакты

HOME: `680-water-wet-tone-qa/temp/timeline/native-cbe-retry1/`: report.json, presentation-deltas.json, OFF/ON PNG frames, final-canonical PNG, timeline-atlas.jpg. VPS task temp/timeline содержит копии report/deltas/atlas и controller native-function.js/run.mjs. Исходная невалидная попытка: native-cbe/. Аппаратный запуск handle46742 завершён exit0, ownedChromeClosed=true.

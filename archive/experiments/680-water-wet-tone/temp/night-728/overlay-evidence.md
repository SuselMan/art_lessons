# #728: CPU маска мокрой бумаги

Источник: main8aa7e9f0. Экранный CPUфильтр `_updateWetTexture`, без изменений solver, P/C/V, записанного wet, шейдеров и времени высыхания.

На реальном iPad Safari16.3/AppleGPU, Fine1754×2480, water400 на5311: `_updateWetTexture`938–1498мс за прогон, мокрый raster99мс/72обновления, pool8мс, GPUupload1мс. Измерения вложены — суммы разных обёрток не складывать.

Кандидат: прямые индексированные соседи внутренних пикселей, прежний нулевой padding краёв, прежний порядок сложений/round, reusable rowMax/RGBA. Workspace полностью перезаписывается и освобождается при destroy; смена размеров выделяет подходящий массив.

- 7содержательных convolution/zero-padding/reuse tests PASS.
- Old kernel извлечён из8aa index.ts;120fixtures разнообразных float32 на1×1/1×143/143×1/11×13/162×162/224×318:7,832,480RGBAбайт exact.
- iPad alternating order20rounds×5calls, 162×224fixedfloat32: old median9.0мс →candidate4.0мс, все145152байтаexact; visible, контекст не потерян, timeOrigin1791317224144. Это CPUkernelbenchmark, НЕобщий FPS/solverclaim.
- Отвергнут unroll Math.max5: Safari4.8мс, исходныйdirectcandidate4мс; дополнительный вариант не оставлен.
- Полный web typecheck на HOME ownmirror5318 PASS. Реальный wholeengine400/replay контроль далее.

Артефакты: `temp/night-728/{byte-oracle-node.json,apple-overlay-candidate.json,apple-unroll-rejected.json}`; полные скрипты тамже. Независимые свежие нативные штрихи не считать fixedpayloadPNGдоказательством.

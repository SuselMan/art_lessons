# Обычный DEV Room: GL2/MRT/front QA

Явные constructor opt-ins, все OFF по умолчанию. Production watercolorQaOptions возвращает три OFF даже при произвольных/невалидных query; продуктовый UI не меняется. Это **WebGL2/MRT**, не native WebGPU.

| QA arm | Query |
| --- | --- |
| GL1 / original | без новых flags |
| GL1 / front batching | `wcFrontBatch=1` |
| GL2 без MRT / original | `wcGl2=1` |
| GL2 MRT / original | `wcGl2=1&wcMrt=1` |
| GL2 MRT / front batching | `wcGl2=1&wcMrt=1&wcFrontBatch=1` |

Параметры читаются только при создании движка: менять URL с полным перезаходом. Допустимы ровно0/1; duplicate/другие значения и wcMrt безwcGl2 бросают ошибку в DEV. Публичный constructor также отказывает MRT безdiagnosticWebgl2. Если WebGL2 context/MRT shader/capabilities недоступны, явная ошибка — не fallback, который исказил бы сравнение. После_initGL actualWatercolorPasses.warmBrushMrt проверяет capability и создаёт shader; front флаг включает только WatercolorSettleQueue.frontBatchEnabled, без presentation/contact/continuation.

Root gate: реальные перо/старт следующего мокрого400px штриха, два цвета, Undo/Redo, reload одной комнаты; same operation tape/полный layer/material export и actualMRTpairs>0. При сравнении сохранённого snapshot старые pixels могут не упражнять текущий backend: clean operation replay нужен отдельно. CPU constructor/parser tests не заменяют настоящую компиляцию и Room interaction. Потеря контекста/несколько участников/iPad остаются отдельными hardware gates; measured standalone7–11% не обещается для любого Room.

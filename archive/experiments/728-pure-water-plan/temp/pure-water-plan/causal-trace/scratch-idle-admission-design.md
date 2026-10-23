# Допуск предварительных scratch-буферов: CPU исследование

Это не исправление производительности и не включённая функция. Нужна сначала причинная first-pixel фаза profiler.

Реальные getOrCreate/filmBuffers для полного P/C: original,coverage,inkLoad,inkColor +strokeInk,inkBase,strokeColor,colorBase =8 текстур RGBA8.1536²×4=9MiB каждая;8=72MiB. Существующий free ceiling64MiB вмещает максимум7 таких пустых буферов, не8. Для1024²8=32MiB. Считается весь free pool всех размеров, не только нужный. Live buffers не вытесняются и не переиспользуются.

ribbonScratchAdmission вычисляет допуск без GL;2testsPASS. Никакого runtime hook, предварительной paint/clear field, нового shaderwarm или roomstartup work нет. Предварительная texture allocation не устраняет обязательные sourcecopy/clear и может сама блокировать input, поэтому не обещает ускорение.

Если trace докажет именно allocation: потенциальный idle job только после выбора WC, с одним buffer за callback, existing free ceiling, captured engine/context epoch, отмена на pointerdown/peer-material/rebuild/loss/destroy. Не прогревать все resident tiles: один ожидаемый размер, bounded target и только имеющееся headroom. Проверять predicate перед каждым GL действием. При потере контекста после создания не clear/destroy dead handle: engine/pool forget владеют потерей; новый epoch не наследует завершённость reservation. Успешный buf поступает в existing nearest-size free list, где оригинальный потребитель обязан полностью copy/clear перед чтением. Idle admission может перераспределить момент затрат, но не уменьшает model work.

Hot _completeSettle перед _strokeLayerId — отдельная причина. Pool warm не позволяет удалить old-settle barrier: старый copyback перекрыл бы настоящий первый pigment. Для hot нужны disjoint-layer/operator dependency proof или exact source-command rebase с защищёнными input textures; standalone faux preview запрещён.

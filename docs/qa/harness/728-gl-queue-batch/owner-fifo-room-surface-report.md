# #728: первый actual Room gate independent owner FIFO

Corrected entry загрузил настоящую Room на Surface. Три rapid400 штриха приняты; второй DOWN 6.4мс, третий 2.6мс, оба без `_completeSettle` и без `createTexture`. Первый DOWN 56.3мс с одной дополнительной текстурой: prewarm ещё не покрывает всю исходную engine allocation. Это CPU submission измерения, не физическая задержка первого пикселя.

**Quality gate FAIL.** Dry→Undo→Redo изменяет историю осмысленно, но итоговый target SHA после redo отличается от исходного. GL errors0, context не потерян. Поэтому latency proof не даёт права на artist review или включение по умолчанию. Следующий шаг: сохранить полный operation tape, сравнить original canonical rendering и локализовать первую разницу source/finish/history.

Один аппаратный прогон; pre2112MiB, min893MiB, после закрытия собственной страницы1980MiB. Samsung не использовался. Морфинг отсутствует; scope1024/single tile/same wash/capacity3 остаётся явным. Сводка содержит computed source passport и hashes. Raw сохранён в `temp/device-runs/owner-fifo-room-surface-corrected.json`; приватный адрес не коммитится.

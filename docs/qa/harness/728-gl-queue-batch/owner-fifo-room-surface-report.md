# #728: первый actual Room gate independent owner FIFO

Corrected entry загрузил настоящую Room на Surface. Три rapid400 штриха приняты; второй DOWN 6.4мс, третий 2.6мс, оба без `_completeSettle` и без `createTexture`. Первый DOWN 56.3мс с одной дополнительной текстурой: prewarm ещё не покрывает всю исходную engine allocation. Это CPU submission измерения, не физическая задержка первого пикселя.

**Quality gate FAIL.** Dry→Undo→Redo изменяет историю осмысленно, но итоговый target SHA после redo отличается от исходного. GL errors0, context не потерян. Поэтому latency proof не даёт права на artist review или включение по умолчанию. Следующий шаг: сохранить полный operation tape, сравнить original canonical rendering и локализовать первую разницу source/finish/history.

Один аппаратный прогон; pre2112MiB, min893MiB, после закрытия собственной страницы1980MiB. Samsung не использовался. Морфинг отсутствует; scope1024/single tile/same wash/capacity3 остаётся явным. Сводка содержит computed source passport и hashes. Raw сохранён в `temp/device-runs/owner-fifo-room-surface-corrected.json`; приватный адрес не коммитится.

## Same-packed baseline preparation

Полный журнал этой QA Room восстановлен из БД: 3 stroke с packed dabs и Undo/Redo, SHA canonical JSON `27a0d2656a2b348d8baae6d3793fadc88f29f76573389ba8fd600bcb4c17eb56`. Original comparator включает Room gradientFibres=true, async/joined/deferred OFF, solver batching ON. Первый ONE comparator не получил ни одного результата: отсутствующий `/qa-joined-quality.html` попал в SPA fallback и сменил документ до evaluate. Pre2055MiB, собственного abort нет, после закрытия1985MiB. Это invalid fixture, не baseline pixel failure. Исправлено отдельным blank FS entry с ready gate; дальнейшая аппаратная проверка ожидает отдельного слота.

Readonly chronology audit обнаружил пропущенный `target.markContentPainted(bounds)` после canonical source. Boundary восстановлена с CPU count assertion; финальный finish уже вызывал её, поэтому причина SHA расхождения пока не доказана.

Corrected blank-entry ONE также остановился до input/results тем же transient CDP navigation error: pre2081MiB, после закрытия2025MiB. Следовательно отсутствующий SPA entry не доказан как единственная причина первого отказа. Controller теперь подключает Runtime/Page к about:blank до navigation и сохраняет primary frame/exception/crash events. Собственный VPS Chromium CDP blank-entry bootstrap PASS за0.7с; это не Surface engine gate. Повторное аппаратное измерение остаётся отдельно разрешаемым.

CPU corpus расширен actual packed400 материалами70/38/33dabs: original renderer, generated immutable commands и direct preparedGL binder совпали ordered uniforms/F32/phase.45tests8files и strictTS PASS. Это локализует source command reconstruction; реальные solver/history поля ещё требуют hardware comparator.

## Original comparator actual Surface PASS

После исправления CDP startup один actual same-packed original прогон завершился, GL0/lostfalse. Original third-stroke/load SHA и original redo SHA полностью совпали (`45dc5b…`), также совпали с owner-after-redo. Original undo SHA совпал с owner-after-undo (`1d2280…`). Отличается только owner-before-history (`5a639d…`). Значит ошибка локализована в owner canonical execution/finish для данного tape, не в original history restore. Pre2080/min1561/afterclose1950MiB.

Затем source audit обнаружил двойной consuming capture: coordinator.seal вызывал `captureCanonicalFinish()`, который сбрасывает `diffusePending=false`; original async finish вызывал capture повторно и мог пропустить solver. Coordinator переводится на non-consuming `captureFinishMetadata()`. Это конкретный доказанный CPU lifecycle gap; исправленный GPU результат ещё не измерен.

## Corrected finish actual Room PASS

После non-consuming seal один actual Room rapid3 Surface прогон: DOWN2 7.2мс, DOWN3 2.6мс, оба без `_completeSettle` и без texture allocation. Первый DOWN38.7мс и1allocation ещё отдельно исследуется. CPU submission не first scanned-out pigment.

Dry→Undo изменяет target осмысленно; Redo восстанавливает тот же target SHA `a82430…`, dimensions1024²/nonzero777078. GL0/lostfalse. Real solver теперь выполнен; canonical scene elapsed8014.6мс, rAFp9517/max116.8мс. Старый solver-skipped tail непригоден для speed comparison. Pre2061/min961/afterclose1983MiB.

Новый полный packed tape восстановлен и сохранён локально, SHA `7a9dbeeb381c1515857bffc4ddf6781aa20fa26ebcf88aba7a2a89c0ad25a660`. Explicit standalone original comparison этого нового tape остаётся следующим gate. Full UX/morphing не готовы, defaultsOFF.

Новый same-packed original comparator завершился: originalafter3 == ownerfinal == ownerredo SHA `a82430…`; originalundo == ownerundo SHA `2fddea…`. Dimensions/nonzero/hash одинаковы. GL0/lostfalse; flagsmatched gradientFibres=true, originalasync/joined/deferredOFF, queueON. Pre1927/min1487/afterclose1978MiB. Это подтверждённый target/load/history gate для actualrapid3; все working fields/морфинг не проверены.

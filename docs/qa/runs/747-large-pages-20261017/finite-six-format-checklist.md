# Финальный gate: шесть конечных форматов

План, НЕ результат прохождения. Runtime SHA и диагностические флаги фиксируются непосредственно перед серией; текущие Samsung measurements не перезапускать ради этого плана. Новых комнат не создано.

## Существующие own fixtures

Приватный ledger root: `~/.cache/codex-qa/puddle-747-native-gate-20261017/`. Только metadata проверена: disposable=true, owner=puddle_undo747. Наличие файлов не подтверждает существование комнаты на сервере или отсутствие старой истории; перед reuse оператор проверяет owner/API/history, не чистит комнату. Auth и приватные URL не переносить в proof.

| Формат | Лист px | Fixture suffix | Швы внутри листа |
|---|---|---|---|
| A4 portrait | 1240×1754 | fixture-a4p | x1024 / y1024 |
| A4 landscape | 1754×1240 | fixture-a4l | x1024 / y1024 |
| A3 portrait | 1754×2480 | fixture-a3p | x1024 / y1024,2048 |
| A3 landscape | 2480×1754 | fixture-a3l | x1024,2048 / y1024 |
| A2 portrait | 2480×3508 | fixture-a2p | x1024,2048 / y1024,2048,3072 |
| A2 landscape | 3508×2480 | fixture-a2l | x1024,2048,3072 / y1024,2048 |

Другие retained A4L fixtures phase/ROI/three-options — отдельные causal inputs, не подменять ими контроль основного fixture. Использовать существующий слой только после записи его history/Undo head; не применять QA_RESUME_LAYER к произвольному слою: текущий runner пропускает Dry и считает последний Undo своим.

## Одинаковый цикл для каждой строки

1. Оператор: настоящий GPU, профиль/DPR/touch/deviceMemory/model/paper geometry, visibility, GL0/context-not-lost, flags и выбранный слой; без подмены native viewport desktop-эмуляцией. Fit: весь лист доступен, края можно достичь обычным pan/zoom. Снимок UI отдельно от RGBA.
2. Trusted pen A: вода без пигмента, затем пигмент поперёк воды; отдельный долгий gesture через несколько 1024-швов, последний batch на одном дальнем tile. В процессе held видны начало и новый хвост, у peer тоже. Отдельно нижний/правый неполные tiles и углы. Отсутствие искусственной прямой линии/зазора на швах — manual screenshot gate, дополнительно exact raster oracle.
3. ACK всех gesture IDs → естественный canonical-ready. Сначала actual wet goal/physical bytes, потом own full-authoritative-history replay с CPUcache/hidden OFF. Все clipped page tiles, не центральный ROI. Сохранить per-tile changed/max/alpha и input/content hashes, bounds; GL0. Cross-GPU exact — отдельный известный блокер, own-GPU parity его не закрывает.
4. Own Undo последнего gesture → actual/replay; Redo → exact pre-Undo target, журнал только свои target IDs. Peer B должен получить тот же accepted metadata/order и соответствующий same-GPU result; удалённая операция не должна стать target собственного Undo A.
5. Recorded layer-scoped Dry через реальную кнопку/принятую operation. Actual physical captured BEFORE replay должен равняться сохранённому wet canonical. Undo Dry возвращает water eligibility; проверять также новый водяной gesture на выделенном участке (не только неизменный сухой PNG). Отменить этот probe, затем Redo Dry; отдельный цикл Undo/Redo собственного pigment gesture. Проверять реальные target IDs каждого meta-op, не только число Undo.
6. Пока wet: второй участник cold join, authoritative history/coverage complete, material presence и actual-before-oracle; B добавляет воду/пигмент, A/B converged own-GPU results. После terminal Dry cold reload: exact saved physical raster + own replay; pending/jobs/queue/unsettled/lease0. Не требовать covered IDs в сжатом live log, но для oracle получить всю историю API.
7. Manual: понятный wet/dry feedback, не зависшая кнопка/курсор, возможность сразу рисовать после Undo/Redo/Dry/reload; автоматизация фиксирует first-visible и settled отдельно. Таймаут — bounded FAIL/inconclusive с diagnostic, не бесконечное ожидание и не скрытая сушка.

## Что уже можно автоматизировать без Layer history

`docs/qa/harness/747/actual-page-raster-proof.cjs` захватывает физические storage bytes ПЕРВЫМИ, корректно обрезает правые/нижние частичные tiles и сравнивает с replay. Режим canonical-goal читает уже готовые `state.goal` напрямую. Он не добавляет layer_add/Dry/Undo. Для завершения wet canonical достаточно штатного `controller.finish()` после UP: он вызывает request(), RAF start/step/complete. Harness должен лишь дождаться естественного завершения, НЕ вызывать canonicalTiles/close/dry/solver.dry для ускорения и НЕ добавлять dummy layer.

Read-only gate перед goal capture: нет _strokeId/_settle; _opQueue/_pendingRebuilds/_rebuildJobs/_unsettledLayers пусты; _wcCanonical.pending false; own accepted operations pending=false; puddle pending/drying false; нужный resident layer goalReady=true, dirty=false, context установлен, все его goal tiles существуют. Для parked source mode canonical-goal текущего helper не подходит: explicit diagnostic и отдельный physical parked-goal path, не неявный wake/новый слой. Проверить ID/order/content parity API до oracle, history coverage отдельно.

## Конкретные gaps существующего runner

`room-public-android.cjs` уже покрывает trusted seam/edge, Dry, UndoDry/Redo, own Undo/Redo и dry reload. Но default создаёт layer_add, peerSocket не заменяет native peer observer, wet cold join отсутствует. PROFILE/RAW_ROI_ONLY выходят до полного lifecycle; результат нельзя назвать шестью полными форматами. Runtime budget assertion сейчас hardcodes QA_CACHE_MIB=120 и неверен для input-phase224/solve120: нужно записывать phase owner/leases/cache cap и проверять phase-specific invariant, а не ослаблять до любого большого cap.

Для final runner нужен небольшой отдельный orchestration patch: explicit existingLayerId+accepted-history-baseline, чистые read-only natural-goal capture и phase-aware diagnostics, второй native observer, wet reload перед Dry. Не менять нынешний runner во время Samsung freeze. Основной raster helper также использует локальный replay: при covered history сначала отдельный full-API oracle path; без него отметить INCONCLUSIVE, а не чинить actual через absorb/rebuild.

Для оценки latency читать GPU bytes только ПОСЛЕ замеров; full A2 physical+oracle readback сам дорогой и учитывается отдельным временем. В compact proof хранить hashes/per-tile metrics и минимальные seam/edge screenshots, не постоянные многомегабайтные raw dumps.

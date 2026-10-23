# Read-only аудит #728 — 07.10, после записи 16:48

Источник: сохранённый issue728-current.json/md; root docs/qa/728-night-report-20261007.md и 728-snapshot-history-closure.md. Старые PASS не перенесены на новый joined-touch/clear-prefix source.

## Что остаётся открытым

- Undo/Redo: исходный 26px native/history residual не закрывается старым peer agreement. На sync rollback208 подтверждён один 7-op ACK/fresh exact (75355); general UI Undo/Redo, repeated endpoints и все четыре устройства этим не доказаны.
- Multiuser/layers: actual Vega current-default1840 22 barriers/peerRGBA0 подтверждён root; исторические 30107/44022 и structural delete/merge/duplicate/retained — отдельные версии. Новый joined-touch70/guarded5e80 не имеет water→pigment, peer/layers/Dry/history/loss gate. Нельзя закрыть общий checkbox матрицы по одному fixed RGB кейсу.
- Context loss: historical pending owner/accepted chunks + foreign arrival/fresh подтверждены на Vega; нет полного loss+checkpoint+history gate на текущем sync/новом joined-touch на Samsung/Surface/iPad. Старый midpen claim отозван: actual ops не содержали Undo/Redo.
- Devices: текущий ordinary meaningful history/fresh имеет Vega. Samsung bootstrap отсутствующего nonce — INCONCLUSIVE, не failure модели. Surface runtime timeout не PASS. iPad rollback100 краткий input имел max1083ms, не parity/loss matrix; clients=[] не устройство QA.
- Firstload: current 44 sync OFF/ON actual47→Undo48→Redo49→snapshot49/fresh и held peer48 ещё не исполнены. CPU confirmedStream реальный watermark4 доказан; actual опубликованный48/49 — отдельный аппаратный обязательный guard.
- CrossGPU: strict same42 outlier alpha76/max65 открыт. Не приписывать его baked и не закрывать по p99=1. Existing neighborhood controller ещё не снял первый divergent physical pass.

## Имеющиеся точные входы и harness

- Original47: immutable SHA dec30b3a6399c3835819b71fa651cd41f213394ff4bba6f51a7df30292ca1266; HOME firstload-sync-f0b784ed/input47.json. Tracked controller.mjs/peer-arrival.mjs/room-probe.js/guards.mjs в docs/qa/harness/728-firstload; собственный 5341 runtime,940 SHA exact.
- Snapshot covered redo: HOME680-lifetime-hardware/temp/night-load-ui/temp/snapshot-closure-f877-settled/report.json +A/B/fresh/late PNG. Это previous failure exact boundary, не актуальный4device claim.
- Structural: HOME680-puddle-outline/temp/structural/{delete-retry2,merge,duplicate-retry1,retained}; VPS728-structural-hardware temp/hardware/structural-reports. Includes live/ordinary reconnect/late/full-authoritative640×480 exact, UI/buffer topology; source прежний.
- Stored47: HOME680-water-wet-tone-qa/temp/root-load-current/result-stored-poll; VPS root temp/night-728/load-current/stored-load-report.json. Original47+Dry48; real uploader/index/blob, cold1615/warm1152ms, не currentclearPrefixON.
- Current root1840 matrix raw handle15648 известен root; путь из нового report надо получить у владельца, не придумывать из старого matrix-fifo.

## Самый короткий следующий meaningful case после primary firstload

Запустить уже подготовленный peer-arrival.mjs на том же5341/source44 и immutable47: два auth, один reader на held restore, actual author Undo48 при suspended prefix, actual confirmedStream latestKnownSeq48 и authoritative operation ID; затем ordinary snapshot48/полный fresh PNG. Обязателен observer окна: если peer пришёл после replay, результат INCONCLUSIVE. Это закрывает новую race, не повторяет дорогую четырёхслойную матрицу и не требует нового физического shader. Primary firstload уже покрывает отдельный Redo49/snapshot49. UI кнопки/history-policy остаются отдельным subsequent gate.

## Commit527836c2 readiness

Только QA_INPUT env override и новый QA doc, production/runtime source отсутствует. На root guards.test.mjs уже modified: перед cherry сравнить этот exact one-line override; если уже такой же — оставить root строку и добавить лишь doc. Исторический fallback absolute path намеренно документирован, portable run задаёт QA_INPUT. Ни один runtime файл5341 в commit не входит.

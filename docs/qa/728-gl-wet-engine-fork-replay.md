# CPU replay влажности через настоящие обработчики Engine

Конструкторный DEV `diagnosticWetReplay` требует `diagnosticPointerAdmission`; Room/query его не включает. Допускается только изолированный fresh normal20/100, один source operation без chunk flush, без открытого wash, peer/rebuild/FIFO и внешних callbacks. Каждый dispatch повторно проверяет владельца и изоляцию до изменения материала.

Engine-local getter направляет только input sampling/deposit/drain/drop/commit в независимый PaperWetness fork. Typed cursor использует записанные DOWN/join/checkpoint/per-batch/UP времена; глобальные часы и readonly live PaperWetness не заменяются. Display/drying остаются live. Foreign wet operation и chunk flush внутри scope явно запрещены.

Actual PointerInput с coalesced samples → исходные watercolor handlers записывает baseline. После изменения live paper/tool/layer replay тех же handlers с captured opts/IDs и cursor даёт целиком тот же Operation, включая packed geometry, pressure, wet и timestamp. Live paper сохраняет объект, record count и Float32 wet/pool rasters. MockGL означает CPU contract, а не GPU/pixel/UX proof.

Негативные проверки: неверный clock stage без fallback, чужой/уничтоженный владелец, throw handler, reentrant observer, callback установлен после capture перед DOWN/MOVE/UP. Последний rejected до handler/callback и изменения live модели. Ошибка инвалидирует packet и блокирует fresh Engine; finally восстанавливает контекст, **не откатывает scratch/log/GL**. Такой Engine следует уничтожить.

12 тестов wet replay/transcript/pointer admission PASS; app + service-worker TypeScript PASS. Runtime activation, foreign wash, GPU readset retention, fork→live merge и задержанный реальный input остаются HOLD.

## Explicit accepted CPU model promotion

Constructor-only diagnosticCaptureWetReplayAuthority uses exact authority.snapshot provenance. After actual _onEnd, complete cursor and actual done OperationLog stroke identity (actor/layer/stroke/wash/id) establish a one-use completed capability. Explicit diagnosticPromoteCompletedWetReplay additionally checks unchanged journal/layer owner, no active input/context loss/destroy/failure/callback/peer/FIFO/settle/rebuild/canonical pending and compatible wash owner. Actual natural settle must finish; no forced drain added. PaperWetness authority then rejects intervening live writes and installs prepared fork state.

MockGL oracle compares whole Operation and raw full wet state against original handlers; original changed-live replay without promotion remains valid. Failed/unfinished/destroyed/reused/stale-live promotion rejected without live changes. This proves local journal acceptance and CPU model state only, not server ACK/GPU publication/readset ownership. No Room/query/runtime activation.

Receipt guard: authority capture rejects any pre-existing ID (including undone/queued). _onEnd retains the exact newly appended log entry only when entry count advances once and every submitted payload field matches (log injects its own seq). Silent append rejection cannot create completion. Promotion capability is consumed on every attempt, including an early busy attempt: wait natural idle before calling.

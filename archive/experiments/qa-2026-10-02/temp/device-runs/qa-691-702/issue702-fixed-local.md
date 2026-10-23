Исправлено локально: `03243d26` в `agents/qa-2026-10-02`, base `origin/main=8990c479`; финальная проверка продукта на `bb791820`. Push/merge не выполнялись, issue OPEN до мержа/проверки.

Причина подтверждена 1×1-fence перед полным readback: ожидание GPU queue доминирует, само чтение idle1024² на iPad21–22ms. Нарезка readback не исправляет ожидание. Первый GPU-only вариант с маленькими текстурами также отвергнут: iPad allocation park687ms.

Теперь resting wash сохраняется **без CPU-readback** в GPU state. Whole original передаётся во владение parked state; известные write rectangles прочих буферов упаковываются в tile-sized атласы существующего pool. Если упаковка не экономит память, передаются целые буферы. Все байты входят в прежний GPU budget300MiB на iPad и cap128MiB; при нехватке старейшая заливка восстанавливается из журнала. Partial cancellation освобождает только новые копии и оставляет live scratch; target replacement/retirement/destroy/context loss освобождают parked ownership.

Native AMD/Intel/Apple: **все8 буферов512² и1024² восстанавливаются побайтно (SHA-256)**, включая ненулевой RGB под alpha0 и original вне wash. Park/unpark readCount0, scissor1×1 восстановлен, GL error0. Контрольный scratch1024²32MiB хранится в12MiB. iPad park0–2ms, разрешение таймера1ms.

Финальная свежая комната `a2PX6ql2`:3 настоящих GPU +17 сетевых identities,20 участников,9 инструментов,10 раундов, undo/redo/reconnect, errors0. Exact probe окружал только `work.next` и synchronous eviction, а не всё время жизни async job: AMD/Intel/Apple **179/176/183 шага**, **CPU reads0 у всех**, max**0.2/0.2/8ms**, шагов >100ms нет. После settling wash GPU memory206MiB у всех; iPad ниже прежнего300MiB. Full raw convergence PASS: max17/15,0 каналов >24.

Это устранение конкретного stall-path, не обещание общей плавности20-person drawing: другие draw/settle frame gaps до862ms на iPad в этом run сохранены в отчёте. Старый broad probe захватывал сторонние QA/snapshot readbacks и не используется как счётчик spill reads.

Permanent runner `parkedWashParity.mjs`, cancellation/ownership tests `index.parkedWash.test.ts`, budget tests `index.watercolor.test.ts`; native continuation/undo/redo/late replay `rebuildSpill.spec.ts`. QA-023 и обновлённый QA-020, полный отчёт в `docs/qa/`; artifact root `temp/device-runs/qa-691-702`, exact probes `final3-exact.log`, native buffers в путях `final3-regressions.log`. Связанный вопрос понимания устройства памяти — #703.

Финальные checks:3420unit/269files PASS; typecheck, lint:fix, map checks и production build PASS. Native five-author continuation/undo/redo/late replay PASS на финальном коде; все4 context-loss scenarios выполнены. Один начальный TLS-load failure не дошёл до редактора, отдельный повтор PASS; сохранён в отчёте.

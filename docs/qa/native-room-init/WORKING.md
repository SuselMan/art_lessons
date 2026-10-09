# Native watercolor: текущий проверенный baseline

- [x] Source preparation 15+3; actual shader/cache consumption.
- [x] Paired brush: исходные 210 pulses, оба copyback, побайтная parity.
- [x] Static front factor cache: all240front, cache budget18MiB и ACK retirement, побайтная parity.
- [x] Actual interactive factor baseline: source caa653bf, второй synthetic DOWN→originalsubmit361,3мс. Не physicalpen и не UXgain.
- [x] Front shared tile: actual source bdab5e6f; exact10roles+endpoint, только120eligible stride1 из240. Всеfront714,60→714,47мс; существенного выигрыша нет. Candidate OFF.
- [x] Evidence: temp/device-runs/native-front-tile-bdab-promoted-20261009, SHA descriptors сохранены. Native resources RELEASE; root штатно удалил registered disposable.
- [ ] Native early source admission/COW. Текущая FIFO сохраняется; подготовленные commands не являются отдельным immutable material owner.
- [ ] Полный content revision/read-set паспорт всех dynamic native writer paths. Texture identity/owner generation/liveledger недостаточны после samebuffer.clear/copy/dispatch.
- [ ] Versioned publication и canonical baseline для pending-source layer; без них early source не разрешён.
- [ ] Будущий interactive протокол: actualgap/previouswet/pending, source/FIFO/ACK/display, no hotreadback; только после безопасного ownership implementation.

CPU prototype defaultOFF проверяет actual Runtime→Executor references перед encode/prepare и после существующего publication ACK до GL import. Он не доказывает immutable contents и всегда оставляет earlyAdmissionAuthorized=false. Исходный shader/material/scheduling порядок неизменён. Hardware proof относится к bdab, не к следующему prototype HEAD.

Для reviewable QA baseline: wcNative + source preparation + pressure/observed3 + pairedON; cache+factorON только owned QA hook. Film/tile/mode5/identity OFF, cap8/4мс, scope0. Не публиковались push/main/deploy или новый пользовательский сервис.

CPU readiness: 34 targeted tests (actual source executor, actual Room executor, actual central FIFO) и tsconfig.app PASS. Same-generation field replacement, stale epoch/foreign owner/liveledger loss, held publication и allocated-job cleanup проверены. Старый retirement fixture дополнен существующим retireStaticFrontCache callback; продуктовый cleanup не изменялся ради fixture. Samebuffer.clear остаётся content gate HOLD. Успешный prepare identity не является immutable byte proof.

Partial encoded-write ledger: DEV diagnosticContentVersions OFF, WeakMap только opt-in; upload/staging/clear/copy destination counters после успешной команды. complete=false всегда; raster/compute/brush/composite authority не закрыта. Два actual-backend CPU helper tests и appTS перед локальным commit; hardware не запускался. Никакого COW/reorder разрешения.

- [x] CPU ACK-overlap proposal: actual Executor + deterministic sentinel queue, 3 tests; app TS. Private publication snapshot/order, late-version/retirement rejection и stale new-owner GL seed проверены. Production FIFO unchanged; private GPU view/version authority ещё отсутствуют. См. native-ack-overlap-cpu-model.md. Early admission остаётся HOLD.

- [x] Не подключённая private publication host factory: два actual raw bridge canvas, active lease до import finally, no extra ACK/fence. CPU tests + app TS; logical max 8 MiB при1024², physical swapchain unknown. Runtime/defaults неизменны, stale new-owner seed не разрешён, early admission HOLD.

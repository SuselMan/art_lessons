# Macro34: isolated exact GPU initialization, лёгкая ветка

Новый ID `wgsl-macro-gpu-initial-coherent-dt4`, export `gpuInitialDefinitions` из `macro34-gpu-initial.ts`. Только Lite: фиксированы physicalDt4/steps64, mobility3/eddy8/curl64 по умолчанию. Pair — **неизменный physicalDtSource(gain,4)**, PACK — **неизменный MACRO19_COHERENT_LOCAL_DITHER_PACK**. Actual SHA pair/PACK/initializer доступны в metadata. Shared factories, WGSL физики, registry/worker не изменены.

## Данные и порядок

CPU оставляет validateInput, exact paper-only1024→128 reduction и прежний buildStream. Никакого CPU RGBA/water reduction в default verify0. Upload: исходный packedRGBA4MiB, packedwater1MiB, CPUaux(P,absCap,encodedψ)256KiB —5.25MiB. Input words byteextract через shifts/&255, без больших remainder/float. GPU initializer:1 invocation на8×8cell,256workgroups×64threads; первый64sample scan вычисляетсуммы/максимумы и пишет **каждый** stationary slot, включая0. Freeze повторно копирует64packedRGBA. M/D/W/S/pad и aux записываются полностью. Seven storage bindings.

GPUsummary64B очищается перед init в command encoder. Atomic additions: все initial scalar fields и4coarseRGBA totals, bounded≤1,073,725,440; исходный finealpha≤267,386,880. Init compute pass завершается, затем optional3snapshot GPU copies, затем64physical pair dispatches и1PACK. Между init/solve нет CPU read/map/await. Upload сохраняет прежнюю queuecompletion boundary для завершения raw writes, но ничего с GPU не читает. Fixedphaseflags2 обоснованы/guarded: actual Lite PACK использует bit4 и localstationary check, **не** globalstationary bit1.

После ready, вне timing: existing output readback, finalcoarsestate +64Bsummary copy/map. Только тогда metadata.initial становится доступной (раньшеnull/initialSummaryPending=true). Coarse ledger сравнивает фактическиеGPUinitialRGBA/W с final state. Это новый lifecycle contract отдельногоID, не скрытое изменение старого host. Summary atomic contention (~16k×10operations), scalar64loop и дополнительный input upload могут нивелировать CPU выигрыш; speedclaim пока отсутствует.

## Verify1 не является performance-режимом

`verifyInitializer:1` выделяет5MiB MAP_READ|COPY_DST snapshot buffers: initialstate0.75 +aux0.25 +stationary4MiB. Копирование сразу после init, **до** физического solver. Маппинг лишь после всего solve. CPUfast oracle +same buildStream вычисляет expected fullSHA/summary; реальные snapshot SHA сравниваются со всеми3expectedarrays. Mismatch бросает explicit error после сохранения initializerVerification{buffersExact,summaryExact,passed}. Эта диагностика добавляет CPUarrays/hashwork/copies и не сравнивается по времени с verify0. Metadata diagnosticExtraBytes описывает только5MiB GPUbuffers, не transientCPUoracle arrays. Debug buffers и обычные buffers освобождаются idempotent destroy; partialmapfailure unmaps уже mapped buffers.

## CPU проверки

5tests PASS81.5сек: shader algorithm independent packedbyte emulator против actualfast наzero/dry/saturated, всех64offsetsopaque и lowwater/checker; все13protected actualinputmaps state/aux/stationary/fullsummary bitexact. Проверены WGSLreservednames, unconditionalstationaryreset, D/S/pad0, u32counterbounds. Actual host mocks: pair/PACKsource+SHA, отсутствиеmap/summaryдоrun, upload sizes, clear→init→snapshots→64solver→PACK order, mapfailure cleanup и invalidconfig prealloc rejection. Повторный focusedhost/source gate3PASS после sourceSHA/localPACK guards. StrictTypeScript/scopedoxlint0.

Это **не компиляция WGSL настоящим драйвером** и не доказанная GPU exactness. Первый device gate обязан verify1 на нескольких captured +opaque/checker fixtures, fullinitialSHA/summaryexact, finalRGBA==old dt4 и all4coarseledger. Лишь затем verify0 A/B afterpause и totalReady/upload/run separately. Fine host сюда не включён.

Граница измерения: GPU initializer находится в run(), не в upload(). Поэтому GPU timestamps двух compute passes включают init и solver/PACK; upload-only и solver-only числа не сопоставимы напрямую с прежним CPUinitializer. totalReady с общей границей остаётся честной величиной для A/B. seedUsed=strength>0, PACK hashseed по-прежнемуfixed0.

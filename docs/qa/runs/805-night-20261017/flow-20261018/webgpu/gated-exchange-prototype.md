# Macro25: ограничить symmetric exchange, сохранить256advection/adsorb

`macro25-gated-exchange.ts` экспортирует `gatedExchangeDefinitions`, id `wgsl-macro-coherent-gated-exchange`. Используется настоящая fast coherent factory/upload и прежний Lite safePACK; fine ветка не добавляется. Новый режим модели — только число symmetric exchange вызовов. Coarse steps256, mobilityGain3, eddyCells8/curlStrength64 одинаковы для64/128/256контролей.

## Сбалансированная схема

Период16фаз. Для active64:первые4ON+12OFF. Для128:8ON+8OFF. Для256:16ON. Активные блоки кратны4, поэтому по каждой из4parity/axis фаз получается16/32/64вызова соответственно. Просто every4th phase выбрал бы одну ось/паритет — так не делается. Control256 включает каждыйexchange и должен численно совпадать с прежнимcoherentLite при техжеconfig, после actualverification.

Coherent fourth overrides получили optionalpairSourceOverride/exchangeSchedule. Schedule копируется и валидируется доcompile/alloc. Optin создаёт8uniform groups:4OFF+4ON. Отдельный bit8 управляет только guard exchange. **Bit2 всегда остаётсяON**: его переключение одновременно изменило бы absorption1/128↔1/32 иadsorption20↔70, что сломало бы причинное сравнение. В shader изменён ровно exchange guard; advection/head/curl/adsorb ивсе256dispatch прежние. Default options используют прежнийsource/4groups/alloc.

Допцена:4uniform buffers16bytes=64bytes и8extra bindgroups, созданные доtiming. Dispatch count257 прежний. Долячислаexchange calls сокращается, но остальные arithmetic/reads/writes остаются: нельзя обещать4×GPU. Это модельный schedule эксперимент, не exact-output optimization дляactive<256.

## Численная проверка

3newCPU PASS:точныйcount64/128/256+все4parities; обратный source-anchor transform восстанавливаетстарыйshaderцеликом;20krandomON/OFF pair oracles сохраняют4channel M+D/W+S/cap/premul, ONexactoriginal и W/Sпобитово одинаковыON/OFF; actualfactory выбирает64ONиз256приbit2alwaysON, mutablecaller scheduleпослеcreateнеизменяетsnapshot, invalid schedulefailbeforealloc, defaults4groups/sourceunchanged. Existingmacro14+macro21 regression8PASS. TypeScript/lintPASS. CPU oracle gateподставлен только вexisting exchange call, не переписана advectionформула.

## План GPU, не запуск автора

`macro25-gpu-cases.json`:21case=7сцен×256/128/64. Mini-wave; native-flow-pool-drop; dynamic-two-strokes; dynamic-stroke-through-pool; gallerysheet3/4/12. Всеinputs накаждойтройкеSHAidentical, configкромеexchangecountunchanged.3повтора;5sidleмеждуповторами внеtimers, поэтому paused/warmclocks различать. Carrier raw экспорт ограниченmini/sheet12, остальныеPNG/hash/metrics достаточно доfinding.

Сначалаnumerical/determinism/premul/error/source/field/initialchecks; W+Sдолжен бытьтемже приодинаковыхсценах. Pigment4channelconservationдоказанаCPU, actualoutputRGBA8количественныеизмененияпроверяютсяотдельно. Control256сверить сexisting fastLite sameconfig, не со старымeddy16/curl128. Потом картинки:ширина/плотностьтела, формаструй, two-color mix, мягкийhalo, originalcoreinside/outside. Меньшеmixingможет ухудшить color mixing; этоtradeoff, неартистическийбалл. Terminalrimкандидатизsourceaudit не реализован. Runtime/index.ts/GPU автор не трогал.

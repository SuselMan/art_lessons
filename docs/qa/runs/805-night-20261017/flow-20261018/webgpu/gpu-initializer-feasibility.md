# Точный GPU initializer: предварительный аудит

Историческая заметка до реализации: фактический формат и проверки описаны в [macro34-gpu-initializer.md](macro34-gpu-initializer.md). Числа ниже относятся к рассмотренным вариантам, а не к измеренному выигрышу.

Цель — только заменить exact CPU preparation старого/fast initializer, не physical pair/PACK/ψ. Один invocation на coarse128²cell читает64RGBA/water samples; пишет M/D/W/S, aux и все64stationary pixels. При freeze повторно читает/записывает64RGBA. Все stationary slots обязаны записываться каждый upload, включая0; иначе следующий ввод наследует старые literal pixels. D/S/pad тоже инициализируются0, не предполагают свежесть allocator.

## Что остаётся CPU

`buildStream` использует coarsepaperP=round(sum64paper/64), затем свой integerblur/noise/mean/divisor и пишет ψ. Поэтому для неизменного поля всё равно нужен CPU проход по1MiBpaper и прежний buildStream. Дополнительно нынешний validateInput ходит по4MiBRGBA — удалять проверку ради скорости нельзя без отдельного безопасного контракта. Полного исчезновения CPU preparation не будет.

Лучший минимальный upload: packedRGBA4MiB + packedwater1MiB + interleavedcoarse(P,encodedψ)128KiB = **5.125MiB**, против нынешних state0.75 + aux0.25 + stationary4 =5MiB. Paper не надо повторно отправлять целиком: CPU уже вычислил exact coarseP ради поля. Простая альтернативная версия со всеми finepaper bytes и ψ64KiB требует6.0625MiB. Вода иRGBA отправляются исходными byteviews черезwriteBuffer; WGSL распаковывает4байта изu32. Нельзя раздуть water/paper доarray<u32> на каждый finepixel: это резко увеличит память/transfer. Формат packedbytes следует явно закрепить и проверить на устройствах.

## Минимальный host

Текущий initializer hook синхронно возвращает CPU arrays, а observePacking не раскрываетaux; внедрять в него асинхронныйGPUinitializer неудобно и меняет контракт. Предпочтительнее **отдельный isolated candidate host**, использующий неизменные coherentSource/physicalDtSource и Lite safePACK плюс прежний CPU buildStream. Примерно тот же небольшой allocation/run lifecycle macro14, без изменения shared factory defaults. Слоты:3readonly buffers(RGBA/water/Pψ), state/aux/stationary RW, summary atomic RW —7storage bindings. Дополнительная resident память≈5.125MiBinput + несколько десятков байт summary/staging; прежние state/aux/stationary нужны и не исчезают. Это не уменьшение GPU memory.

GPU init dispatch идёт до физических pair dispatches в той же очереди. Нельзя вставлять map/await summary **между init и solve**: это вернёт CPU/GPU barrier и может съесть выигрыш. Поскольку current coherent/Lite PACK не используетstationary-presence flag1 для global fallback, его необходимыеflags2 и localstationary branch не требуют CPU summary. Это утверждение только для данного coherent/Lite path: старый global MACRO9 fallback зависит отflag1 и не переносится автоматически.

## Сводки и guards

GPU считает initial summary atomic<u32>: drysum, mobilesum, frozenWetAlpha, frozenCellCount, watercodes, coarseRGBA. Каждый cell добавляет локальные суммы один раз. Все итоги bounded: finealpha≤267386880, coarseRGBA≤1073725440, Wsum≤268435456, cellcount16384. Cell sumRGBA≤16320; sum*257+32≤4194272. Division только64/256/power2, никаких больших constant modulo или float. GPU atomic sums точны при этих пределах, но global contention16k×~10atomic может оказаться заметным; это реальный риск времени, не обещание выигрыша. Workgroup reduction может уменьшить contention, однако сначала нужна простая baseline реализация, а не дополнительная оптимизация вслепую.

Summary копируется/мапится **после solve вне timing** рядом с существующим fullstate readback. Такinitial/finalRGBA guard работает без pre-solve readback. До завершенияreadback initial metadata должна явно бытьpending/null, не подставлять старыйCPUsummary. Существует риск семантики caller, который читаетinitial сразу послеupload; это ограничение изолированного нового ID нужно зафиксировать. Для QA отдельно сравнить GPU initial state/aux/stationary FULLSHA с CPUfast на13actual+all64opaqueoffset/checker/water1/4/61/255 fixtures; сравнение только finalRGBA недостаточно.

Итог: технически жизнеспособно, arithmetic exact и memory bounded. Возможный выигрыш — удаление CPU RGBA/water reduce+stationary scans/alloc, а не field generation/validation. Взамен +inputresidency, init GPU work и атомики. Сначала нужны init CPU-vs-GPU proof и A/B totalReady/upload/run separately; при текущих60–100ms solver нельзя заранее считать этот перенос главным bottleneck.

Первичные спецификации: [WGSL atomic built-ins](https://www.w3.org/TR/WGSL/#atomic-builtin-functions), [WebGPU queue/commands и buffer mapping](https://www.w3.org/TR/webgpu/). GPU completion и mapping — разные границы; readback не должен входить в physical timing или подменять его.

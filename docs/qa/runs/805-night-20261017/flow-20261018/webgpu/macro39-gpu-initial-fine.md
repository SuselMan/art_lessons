# Macro39: GPU-подготовка и прежние четыре мелких обмена

Новый `wgsl-macro-gpu-initial-fine` соединяет macro34 с неизменённой smooth-fine реконструкцией macro17. Конфигурация сравнения с macro31: dt4, steps64, fine4, mobility3, eddy8, curl64, affinityBase64, paperGain1, dither1. Политика capacity-aware macro36 не подключена.

Macro34 получил узкий четвёртый аргумент `GpuInitialOverrides`: observePacking, pairSourceOverride, packSourceOverride, stateHash. Допускается только собственный physicalDtSource(gain,4), единственный явный PACK override MACRO10_LOCAL_PACK, stateHash только false/undefined. Неизвестные опции и исходники отклоняются до компиляции/выделения памяти. Без override прежний MACRO19 PACK и метаданные сохранены. Хешируется фактически выбранный PACK. Оба известных локальных PACK не используют initial flag1; GPU initializer оставляет flags2.

Fine заимствует state/stationary/output, владельцем остаётся macro34. Наблюдателю передаётся копия списка state-буферов; буферы не копируются. Исключение наблюдателя освобождает все выделения. Начальный GPU summary отсутствует до readback: fine получает его только после underlying.readback, вне таймера.

CPU-проверка: 3 новых теста + 3 focused macro34 PASS; strict tsc и scoped oxlint без ошибок. Фактические исходники всех программ, кроме нового initializer, побайтно совпали с macro31, включая избыточный базовый PACK. Проверены поле stream, три compute pass, отсутствие map до readback, очистка/повторный destroy, ошибки опций и callback. Это проверка host-композиции, не замена аппаратной проверки.

GPU-граница включает initializer, coarse64+PACK и fineINIT+4pair+PACK (три pass). Поэтому GPU-время не сопоставлять с прежним solver-only без оговорки; totalReady остаётся основной общей границей. verifyInitializer1 дополнительно сохраняет три начальных буфера и считает CPU-эталон: это диагностический режим, не измерение скорости. Новых GPU-запусков автор не выполнял; временных ресурсов не создавал.

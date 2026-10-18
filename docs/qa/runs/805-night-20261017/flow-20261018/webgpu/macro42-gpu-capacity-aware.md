# Macro42/43: прежняя реконструкция, подготовка на GPU

`macro42-gpu-capacity-aware.ts` экспортирует `gpuCapacityDefinitions`:

- `wgsl-macro-gpu-capacity-aware-fine`, createFine42: точная оптимизация подготовки модели36. Использует её capacityAwareInit, прежний MACRO17 finePACK, compactAux/compactCarrier и отдельный D. Допускает fineSteps0/4, preset4.
- `wgsl-macro-gpu-capacity-aware-lite`, createLite43: точная оптимизация подготовки модели41. Использует ровно MACRO41_CAPACITY_AWARE_PACK.

Общие параметры: dt4/steps64, mobility3, eddy8, curl64; fine: affinityBase64/paperGain1/dither1. verifyInitializer0 по умолчанию, 1 только для проверки начальных снимков, не оценки скорости. Изменения политики35 не подключены.

Macro34 принимает только три известных варианта PACK: прежний default19, явный10, явный41. Проверяется полное равенство исходника, а затем индивидуальные якоря отсутствия зависимости от stationary flag1. Любая правка литерала отвергается до GPU-выделений/компиляции. Хешируется фактический исходник. Default34 не меняется.

CPU: 4 новых теста PASS, вместе с39 — 8 PASS; strict tsc/scoped lint0. Фактические программы42fine0/4 и43, исключая initializer, совпали побайтно с36/41. Совпали stream SHA и число прежних dispatch; добавляется только один initializer dispatch. Общие state/stationary/output принадлежат34, fine заимствует их; повторный destroy и исключения callback/map не оставляют выделений. Summary читается после solve, вне таймера.

Три compute pass для42 и два для43 включают GPU-подготовку; прежние solver-only timestamps имеют другую границу. TotalReady — общая граница сравнения. Дополнительная входная память34 сохраняется, это не оптимизация объёма памяти. Аппаратное wholeRGBA/coarse/fine равенство ещё требуется; CPU-мок не выполняет WGSL. Автор GPU не запускал, временных ресурсов не создавал.

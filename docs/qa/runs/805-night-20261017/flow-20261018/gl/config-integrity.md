# Контракт top-level config для сильных research ID14/18–29

Проверка выполняется в worker после выбора Definition, **до requestAdapter/requestDevice/factory**, только для двенадцати явно перечисленных ID14,18,19,21–29. configKeys прикрепляется только к публичному реестру. Внутренние composed factories не валидируют лишние ключи: wrapper может передавать свой config дальше, не меняя historical defaults или WGSL. Старые модели без configKeys не затронуты.

Lite14/19/21: steps,mobilityGain,eddyCells,curlStrength. Fine18/22: те же плюс fineSteps,paperGain,dither. Fine23/24/26: дополнительно affinityBase. TrueFine29: дополнительно compactAux,compactCarrier. Exchange25 добавляет exchangeActiveSteps, limiter28 — ещё limiter. Rim27: fine-ключи плюс rimStrength/rimThreshold, paperGain должен быть0 по уже существующему factory guard.

Особенно: top-level affinityBase у22 не использовался и теперь отвергается; у23/24/26/29 он действительно передаётся в опции и разрешён. mixing/smooth/dither на Lite не используются и отвергаются. mixing на coherent fine также игнорировался actualcoherentbase (flags всегда включали exchange), поэтому не входит в контракт. Existing integerOption/factory guards продолжают проверять диапазоны значений; эта проверка не заменяет их.

Rim27 фактически передаёт fineSteps в macro11; значение24 исполняется24раза, оно не hardcoded12. Поэтому ключ разрешён, а старое описание horizon12 в metadata не является проверкой фактического количества проходов. Existing integerOption ограничивает fineSteps диапазоном0..32; фазы H-even/H-odd/V-even/V-odd повторяются по модулю4. Число H-проходов = 2*floor(fineSteps/4)+min(fineSteps%4,2), V = fineSteps−H. Это консервативный верхний предел перемещения в пикселях по каждой оси, не радиус фактического переноса; для12 это H6/V6, для24 H12/V12. Если исследователь хочет только12, он обязан задать это в запросе/плане.

CPU4PASS: все declared presets двенадцати семейств проходят контракт; unusedbase22/finefieldLite/typo/mixing отказывают до fakefactoryallocation; настоящий bundled worker c fake adapter отказывает ignoredkey до adapter, валидный запрос достигает существующего GPU пути; проверено actual rim forwarding. Транзитивный worker strict/noUnused TypeScript diagnostics0 (WebWorker + @webgpu/types). Definition preset type разрешает number/boolean и inferred absent optional properties, поскольку29 уже имеет boolean compact flags; physics/type guards не изменены.

Новых GPU запусков, буферов или ресурсов нет. Frozen V24 bundle не меняется; следующий build включает только validation на границе запросов.

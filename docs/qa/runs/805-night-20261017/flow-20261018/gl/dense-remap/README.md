# Dense characteristic remap: CPU-only proof и существенное ограничение

**Итог: арифметический oracle PASS, GPU/host НЕ строить до review.** В high-opacity слое safe capacity admission тормозит перенос; это содержательный отрицательный результат, а не оправдание одним exact ledger. Изображения — CPU-деформация синтетических дисков, не акварель и не измеренный GPU результат.

## Почему направление отличается от текущего pipeline

Actual native `apps/web/src/engine/src/raster/WatercolorSettlePlan.ts`:584–617: outward/inward front → extended coverage → band;625–638: lift donor share, gather, deposit;858–888: remobilize old paint AFTER carry. Это пространственно обусловленное перемещение пигмента, а не одна isotropic convolution. Оба pigment/color record используют общий pre-step density (:639–645). Native визуальная выразительность не доказывает физическую полноту модели.

В u32128² `macro8-integer-dynamic.ts:initialIntegerDynamic` сначала сводит пигмент каждого8×8cell. `macro14-coherent-source.ts` добавляет directed pressure/curl к symmetric mixing; `macro30-physical-dt.ts` укрупняет frozen-pair шаг. Реальный coarse порядок H-even,V-even,H-odd,V-odd некоммутативен. С donor/cap clamps DT4 не эквивалентен четырём DT1. Эти механизмы способны создавать осевой рисунок ДО PACK. `macro17-smooth-fine-paper.ts` затем интерполирует уже coarse M/D: потерянные детали исходника не восстанавливаются; fine affinity перераспределяет локально, но не заменяет макроперенос. Это source-зависимости/риски, не доказательство единственной причины каждой PNG-полосы.

Предложенный новый оператор пока существует только как `alternatives/dense-remap-core.ts`: исходный pigment остаётся fine-resolution, smooth velocity задана извне. Площадной texel распадается на4 пакета вокруг непрерывного displacement. Нет coarse pigment average, raw-minus-upsample residual или point-particle cloud. **Нет water solver, M→D adsorption или динамической wetness**: CPU этап проверяет транспорт и static wet-path gate, не готовый художественный алгоритм.

## Целочисленные границы

- Каждый компонент displacement Q8 ограничен ±4096 (±16px). Bilinear floor/ceil с clamped boundaries оставляют любого donor данного receiver в квадрате33×33. Сумма ВСЕХ его пакетов ≤65535, даже при совпадении clamped адресов. Поэтому requestAlpha ≤1089×65535=**71,367,615**, меньше2³². Реальный convergent test без self-request достигает1088×65535=71,302,080.
- Q8 bilinear веса имеют сумму65536. Сначала `A_j=floor(A*cumulativeWeight/65536)` по разностям: точная сумма и неотрицательность. Максимум произведения65535×65536=**4,294,901,760**, меньше2³².
- Затем `C_j=floor(C*cumulativeA/A)` по разностям. При0≤C≤A наклон≤1, поэтому0≤C_j≤A_j иΣC_j=C. Максимум65535²=**4,294,836,225**. Независимое округление RGBA по весам не используется.
- Receiver budget `free=65535−OLD_A`, **без кредита за предполагаемый outgoing**. Пакет принимает `min(packetA,floor(packetA*free/requestAlpha))`. Сумма принятых A≤free. RGB внутри принятого пакета делится пропорционально его принятой A; остаток RGB/A остаётся donor и также premul.
- Финал: old−acceptedOutgoing+acceptedIncoming. Он неотрицателен; alpha≤old+free≤65535; суммы всех4каналов точны. Возврат не отдельный поздний add, способный переполнить donor: непринятая часть никогда не списывается.
- Для статической wet domain используется integer supercover. Диагональное касание corner требует обоих side-cell wet. Проверяется весь путь каждого пакета, а не только endpoint. Заблокированная часть остаётся donor. Не смешивать это с будущим dynamic wetting, где rawW0 не означает immutable стену.

## CPU наблюдения (64/128 grids)

`cpu-observations.json` содержит суммы/центры/request totals/SHA core. `shear.png` и `two-colors.png`: слева исходник, справа8шагов; увеличение3× nearest только для обзора. Shear действительно меняет форму без8px pigment-reconstruction grid; two-colors даёт лишь11 смешанных pixels в данном слабом convergence-control — это НЕ хороший художественный результат.

Сдвиг +0.375px×8 ожидает3px:

| Исходная alpha (byte scale) | Фактический сдвиг | Доля принятых запросов |
|---|---:|---:|
|1|3.02012px|1|
|64|3.00004px|1|
|254|0.41233px|0.13744|
|255|0.38368px|0.12789|

При умеренной alpha64 отдельный +7px×8 control даёт **точный full-array сдвиг56px**, без coarse reconstruction. При насыщении receiver почти не имеет свободного места; изолированный opaque след движется лишь внешними слоями, а полностью заполненный opaque periodic/interior слой вообще блокируется. Нельзя объявлять это полноценной заменой advection. Это цена safe/no-outgoing-credit admission. Исправление требует нового доказанного совместного capacity-flow решения; в этом этапе не добавлялось.

Transpose-control двухкомпонентного поля после8шагов:1944 изменённых u16канала, max5u16codes (~0.0195byte), из-за фиксированного порядка apportion. Все4суммы одинаковы. Для alpha1 centroid bias ~0.02012px. Нельзя заявить точную rotational equivariance или отсутствие subbyte directional bias. На128² синтетике не видно8pxрешётки; есть ожидаемый fine-pixel stair-step контура. Это не доказательство отсутствия packet artifacts на реальном мазке1024².

## Memory до решения о GPU

Фактический CPU oracle держит typed arrays: input RGBA8N bytes +wetN+velocity8N, request4N, рабочий output16N, возвращаемый RGBA8N: peak **45N bytes**, т.е.737,280bytes на128². Это typed-array liveness, не V8 heap/GC и не производительность: временные JS packets создают churn.

Неприменённая GPU binding-схема при1024² (не утверждение реального allocation):

| Buffer | MiB |
|---|---:|
|M ping/pong, packed u16 RG/BA|16|
|Fixed D, packed u16|8|
|Literal original RGBA8|4|
|Velocity packed i16×2 Q8|4|
|Wet mask,4×u8/u32|1|
|Atomic request alpha u32|4|
|Atomic incoming RGBA,4×u32|16|
|Accepted outgoing RGBA packed u16|8|
|Output RGBA8|4|
|Diagnostic readback staging|4|
|**Fine subtotal**|**69**|

Water128 W/S pingpong0.25MiB +aux0.25MiB +129²ψu32=0.063480MiB: **69.563480MiB** plus uniforms/alignment. Если GPU initialization одновременно держит input RGBA/water/paper upload6MiB, named-buffer peak **75.563480MiB**. Эти данные ещё не реализованы; JS inputs, shader/pipeline/driver allocations не включены. Incoming4u32 нельзя заменить packed atomic RG/BA: перенос carry через16bit нарушил бы независимые каналы. Fewer-pass/kernel fusion не доказаны.

Примерный dispatch graph: clear requests/incoming →request →accept+atomic incoming/store outgoing →finalize, минимум4 dispatch/шаг;8шагов32, adsorption/velocity generation добавят работу. Это НЕ прогноз скорости. На этой стадии из-за high-opacity counterexample **HOLD GPU host**, не развивать новый большой solver без review.

## Проверки

`node --test .../alternatives/dense-remap-core.test.cjs`: **6PASS**, в том числе100k split/accept cases с BigInt,64/128 identity/translation/shear/swirl/collision alpha1/64/254/255, diagonal/corner/wall, water-only/dry, request overflow bound, full-array56px translation. `node .../alternatives/dense-remap-audit.cjs` воспроизводит компактные JSON/2PNG. Strict TS/noUnused:0. GPU/устройства/сервисы не запускались, временных dependency copies и процессов нет.

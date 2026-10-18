# Independent density remap — второй CPU этап, не GPU модель

**CPU proof PASS; GPU/host отсутствует.** Отказ от opacity-cap устраняет конкретное торможение насыщения, но не доказывает акварельный характер или полноценное смешение. Предшествующий отрицательный результат [bounded remap](../dense-remap/README.md) сохраняется: alpha254/255 останавливались на0.412/0.384px вместо3px. Это не потеря массы; это ошибка выбора физического ограничения представления.

## Source semantics: mass не opacity

- `webgpu/native-capture.ts:31–44`: общий down-only pigmentScale выбирается по максимуму всех компонентов native inkColor; commonA=round(2*scale*rawA), commonRGB=round(2*scale*rawRGB). Manifest описывает nativeMassPerAlpha2 и nativeDepthPerRGB8. Общая нормировка не делает A физической opacity. RGB>A и depth при M=0 явно допустимы conversion.
- `mini-worker/native-capture-805.ts:20–25`: validForBoundedCarrier — дополнительный отбор сцен RGB≤A. Не закон native pigment.
- Actual compositor `apps/web/src/engine/src/raster/shaders.ts:1592–1635`: D/M и exp(-tau);:2055–2068 — pigmentMass, nonlinear thickness, transmittance. Сам storage nativeRGBA8 тоже конечный, не бесконечно точный/unbounded. Но его насыщение формата не эквивалентно запрету перемещения при commonA255.
- QA viewer `entry.ts:16`: common optical отображается exp(-4*C/(255*doseScale)); A не участвует как opacity blending. Это приближённый общий compositor, не native-equivalent вид.

Oracle хранит четыре независимые неотрицательные плотности **D.r,D.g,D.b,M**. Нет premul-ограничения D≤M, нет локального M≤65535. Тест явно сохраняет D>M и D>0 при M=0 — в том числе квантованный случай из реальной conversion. Это не утверждение физически существующего пигмента без массы.

## Fixed operation quantum и overflow proof

Для текущего1024²byte-input `density=byte*8` без loss; quantum8 фиксирован на всю операцию и одинаков для всех4каналов. Максимальная сумма одного канала1024²×255×8=**2,139,095,040 < 2³¹−1=2,147,483,647**. Состояние никогда не рескейлится и не clamp-ится. Input вне доказанного global domain отвергается.

Каждый donor разбивается по4 cumulative Q16weights, сумма65536. Для C≤2³¹−1:

```
floor(C*w/65536) = (C>>16)*w + (((C&65535)*w)>>16)
```

Здесь shifts unsigned; WGSL u32 либо JS `>>>`. Верхнее произведение≤32767×65536=2,147,418,112; нижнее≤65535×65536=4,294,901,760, оба<u32. Итог≤C. Разности cumulative quotients неотрицательны и точно суммируются в C. Никакой f32 division или 64-bit GPU multiplication не нужен.

Все packets поступают в destination; blocked path возвращается в self. Поэтому глобальная сумма каждого канала сохраняется, любой receiver≤GLOBALsum<2³¹. Старый bound33²×65535 **здесь неприменим**: локальные значения могут превышать65535. Сам displacement всё ещё±16px, поэтому прямые donor находятся в33×33, но overflow ограничивает именно инвариант суммы, а не произвольный local cap.

Тест repeated convergence концентрирует1089 donor×2040=**2,221,560** в одной ячейке (>65535), без переполнения/потери. Alpha-first split и request/accept больше не нужны: это не opacityRGBA. Каждый независимый densitychannel апportion-ится точно.

## CPU результаты и вид

`cpu-observations.json`: raw4суммы, максимумы, центры, quantum, SHA core. PNG `shear.png` / `two-colors.png`: слева исходник, справа8шагов; только CPU exp(-4*D/(8*255)), белая бумага и увеличение3× nearest. Отображение не возвращается в solver, его суммы/коды **не** считаются mass ledger и не гарантируют cross-device exp identity.

| Исходный mass byte | Сдвиг за8×0.375px | Boundedcap вариант |
|---|---:|---:|
|1|3.08171px|3.02012px|
|64|3.00133px|3.00004px|
|254|3.00039px|0.41233px|
|255|3.00033px|0.38368px|

Для254/255 +7px×8 даёт полный raw-array **точный сдвиг56px**. Торможения capacity больше нет. Но quantum8 имеет заметно больший относительный rounding bias у самого слабого1byte следа. Это сохранение массы, не exact arbitrary real-valued translation.

Shear меняет форму без coarse8px reconstruction. В данном плавном converging two-colors поле supports после8шагов остаются разделёнными: **0 overlappingDensityPixels**. Чистая advection гладкой общей velocity не обязана смешивать раздельные material supports; без отдельной диффузии/растяжения-складывания это НЕ удовлетворяет задаче wet-in-wet mixing. Не скрывать этот отрицательный результат выбором более красивой сцены.

Transpose-control:2217 изменённых rawканалов/max4densitycodes (=0.5 input-byte), суммы те же. Exact rotational equivariance не заявляется. Текстура/естественная кромка ещё вообще не смоделированы: только supplied velocity + static wet-path. Dynamic water, adsorption и source-dependent lift не реализованы. Нет основания объявлять PNG художественным улучшением.

## Следующий output contract (только proposal)

Предпочтителен отдельный **density-probe**: rawUint32×4 readback16MiB, source/outputSHA, четыре integer sums/max и quantum8; CPU display отдельно. Старые carrier massRatio/invalidPremul/N/A — не вызывать, формат не masquerade как premulRGBA. GPU/entry/worker не менялись.

Global max normalization в8bitcarrier c outputDoseScale возможна только как lossy view; обратный масштаб renderer не восстановит слабую детализацию, потерянную при округлении после сильной концентрации. Никаких conservation claims по compressedRGBA. Для детерминированного GPUdisplay позднее нужен canonical integerLUT; CPU Math.exp в этих PNG — не такой proof.

## Named-memory/dispatch envelope до GPU review

CPU typed arrays: source16N+destination16N+velocity8N+wetN=**41Nbytes** (671,744bytes на128²), без V8 heap/temporary arrays/PNG. Состояние output непосредственно возвращается, дополнительной Uint16копии нет.

Неприменённый GPU density-probe план1024:

| Buffer | MiB |
|---|---:|
|Density ping/pong,4u32 each|32|
|Packed i16×2 velocity Q8|4|
|Packed wet4u8/u32|1|
|Raw4u32 diagnostic staging|16|
|**Subtotal**|**53**|

Плюс water128 W/S pingpong0.25MiB, aux0.25MiB,129²ψ0.063480MiB → **53.563480MiB** named storage, uniforms/alignment отдельно. CPU input/output/display не входят. GPU displayRGBA buffer был бы ещё4MiB, в этом probe не нужен. GPU initialization upload planes не реализованы; если отдельно держать6MiB byteinput, peak59.563480MiB. Это binding envelope, не измеренный allocation.

Минимальный шаг: clear destination16MiB + один scatter compute dispatch + swap (source vec4u, destination scalar atomicu32 с совпадающим raw layout; разные buffers). До16 positive atomic adds на donor. При8шагах до128M atomic adds для полностью непустого1024² поля, плюс fine wet-path reads. Возможны contention/bandwidth stalls; скорость не предсказывается. Практический CPU-test допускает только64/128, не1024 timing.

`dense-density-core.test.cjs`:5PASS,100kBigInt и предельные C=2³¹−1,w={0,1,32768,65535,65536}; saturation254/255; local concentration>65535; RGB>M/zeroMdepth; no-material/dry/wall/corner и invalid bounds. StrictTS/noUnused0. GPU, устройства, сервисы не запускались; новых dependencies/процессов не осталось.

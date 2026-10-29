# AlphaDarken32 scalar: WebGL1 counterpart

Явный профиль `optimized32-scalar-f32-rne-v1`; не genericInteger,
не vector packet, не автоматически выбранная реализация установленной Krita.
Активные shader/painter пути не изменены. Файл экспортирует только GLSL string.

Первичный источник:
- [KoOptimizedCompositeOpAlphaDarken32.h, compositeOnePixelScalar](https://github.com/KDE/krita/blob/bd6e8d061d2f0388c5b10278786cf0fe62e3135f/libs/pigment/compositeops/KoOptimizedCompositeOpAlphaDarken32.h),
  локальный SHA256 `2025a1b2ba4b703ab1f38a61548d3bd7b1f99f60a5aa109ec1bcaddc27814c4d`.
- [KoAlphaDarkenParamsWrapper.h](https://github.com/KDE/krita/blob/bd6e8d061d2f0388c5b10278786cf0fe62e3135f/libs/pigment/compositeops/KoAlphaDarkenParamsWrapper.h),
  SHA256 `da6641dab1dba47dd9710c402d3f2c08f74330ab51466407da95c687ce9c186b`.

Исходные файлы имеют LGPL-2.0-or-later. Здесь самостоятельно выражен численный
контракт, не перенесён vendor body/шаблоны/символы C++ реализации. Исходные fixture
шаблоны/лицензии принадлежат CPU-оракулу и сохраняются у его владельца.

Вход RGB/A — прямые integer-valued byte floats, без промежуточного byte-premul.
`controlValues`=(opacity,averageOpacity,flow,mask), `controlSelection`=(variant,hasMask),
variant0=creamy,1=hard. Controls передаются как F32 (uniform store), проверяются
на стороне host согласно CPU-контракту. `averageOpacity` — уже эффективный
ParameterInfo lastOpacity после alias-решения; обновление running average здесь
не выполняется. Hard wrapper умножает O/A на flow ровно один раз внутри функции.
Optional selection mask применяется отдельно от уже входящей в sourceA маски.

Требуется объявление `precision highp float;` в host fragment и проверка
HIGH_FLOAT precision>=23. Литералы reciprocalByte и
reciprocalByteSquared — точные значения F32(1/255) и F32(1/65025). Нормализация
маски сохраняет порядок mask*reciprocalSquared, затем sourceA. Lerp разбит на
subtract/multiply/add. RGB и alpha округляются nearest-even через floor/parity;
при dstA0 копируется скрытый sourceRGB даже при нулевом итоговом alpha.
В alpha используется обычное float divide, без hardware reciprocal estimate.

Одного highp23 недостаточно для заявления о любом GLSL compiler: допустимая
конкретным backend contraction/reassociation должна проверяться GPU-оракулом
на byte-boundaries. Приватный runner в fixes-v52 использует native scalar
fixtures/overlap steps и отдельный seeded portable-CPU stress, выдаёт точные
несовпадения, не ослабляя сравнение. Он создаёт один isolated context и удаляет
все свои GL objects/tab в finally; запуск устройства принадлежит root.


## Доказанная ошибка struct carrier

Первый GPU вариант передавал controls через GLSL struct. Actual Samsung:
9904cases/160wrong (26native),maxDelta1. Float-FBO stagecapture показал
getUniform O=.812663733959198, но внутри функции O=.8125. Маска M при этом
сохраняла F32, и sourceAlpha уже вычислялась с усечённым O. Это не FMA/RNE/store.
Даже explicit highp struct fields/arguments/locals не исправили результат.

Независимая изоляция на том же устройстве: direct uniform/local vector/helper
scalar/helper vector сохраняют F32; struct constructor/helper/full-struct
теряют precision до F16 truncation. Full-vector версия восстанавливает все
20 исследованных ошибочных пикселей. Поэтому новый API использует только
плоские highp vec4 controls + vec2 policy, без struct carrier. Формулы, controls,
CPU-профиль и допуск не изменены. Регрессия проверяется actual GPU cases и float-carrier isolation receipt,
а не зеркальной проверкой текста GLSL в TS.

Оригинальный failed receipt и исходный GLSL SHAaf3782 сохранены отдельно в
fixes-v52/alpha-darken32-before-struct-device-result.json/.glsl. Диагностические
runners читают сохранённый источник, не новую реализацию. Полный rerun использует
2576native scalar вызовов и8192 portable stress с неизменным expected corpus.

## Полный actual GPU результат после исправления

Samsung, WebGL1 highp23: 10768cases =2576 независимых native scalar вызовов
(1280single +54×24overlapsteps) и8192 portable-CPU stress cases.
wrong0/nativeWrong0/stressWrong0/maxDelta0, GL[]. Shader SHA256
`860c8569601bfdd29ddff351e7b3203064890120ca783e2f36f3bca380212897`.
Fixture SHA256 `7c4710559392483e484d39c1bff2868aa9b3150d9cac1473d15b1d2b581503d7`.
Доказательство: fixes-v52/alpha-darken32-device-result.json, сохранённый
before-struct receipt, diagnostic и isolation receipts. Root закрыл созданные
контексты/tab; постоянных ресурсов этой декларации нет.

Это точное сравнение явного SCALAR F32/RNE numerical profile на проверенном
устройстве/компиляторе, не vector packet/SIMD parity, не определение dispatch
установленной Android Krita и не подключение shader к активному renderer.

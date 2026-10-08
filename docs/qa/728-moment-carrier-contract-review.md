# #728: carrier после реальной source continuation

## Наблюдение

Frozen5355 `bb3a1a3e`, controller `f241dfba`, Surface8октября: short pointer400 создал12 retained contacts/packed802bytes, что превышает предписанный5–8 bound. Gate остановлен без повторения и без replay. Ordinal0/1 supported/applied; сordinal2 carrier unsupported (17964 нарушенных C>P.B каналов, величина GPUcounter не измерялась). Последующие unsupported contacts — явный no-op транспорта/rebase. Native/GL errors0, lostfalse; actual live pigment35624purple pixels/final38333. Никакого художественного/паритетного PASS.

Post-idle CPU audit последнего ROI:365 нарушений/max3, примеры толькоC.G>P.B. Это ПОСЛЕ settle и не характеризует величину нарушения вordinal2. Aggregate C.A/P.B sums одинаковы, но raw не хранит C.A каждого violating pixel: RGB≤C.A по нему не доказано. Raw: `temp/fast-watercolor-night/room-moment-short400-replay-surface-20261008/report.json`. Собственный target закрыт, Surface освобождён; RAMstart2058/min1617/после1780MiB.

## Почему строгий C≤P.B не является стабильным контрактом

`sourcePhaseExecutor.execute` после film вызывает fieldOp1 независимо дляP иC. Literal `passes/fieldOps.ts`: `fit(v)=v/max(1,peak(v))`; landing `fit(base+film)`. P.R/G/A — вода/мокрота/amount, P.B — пигмент. C.RGB — optical depths/4, C.A — optical pigment carrier. Source shader до clipping имеет C.RGB=(P.B)*tau/4 иC.A=P.B, но последующая нормализация использует максимум РАЗНЫХ векторов. Транспорт P.B/C при неподвижных P.R/G/A изменяет относительные пики.

Точный CPU counterexample (Q8, unit test): valid baseP=[200,200,100,200], baseC=[40,90,30,100]; valid filmP=[100,100,100,100], filmC=[40,90,30,100]. Независимый fit даётP=[255,255,170,255], C=[80,180,60,200]: C.G180 иC.A200 вышеP.B170. Ошибка30 не является допуском в один quant. При coherent baseP.B200 reference fit имеетPB255 и поддерживает этот fixture. Это algebraic counterexample, НЕ аппаратная OFF-baseline данного12-dab tape.

`pigmentOptics.ts` tau ограничен −ln(.02)<4; source C.rgb≤C.A в continuous arithmetic. MAX и общая дляC normalization сохраняют этот порядок. Но канонический settle, отдельные shader rounding и исторические материалы требуют реального per-pixel audit. Изменять source fit или clamp только ради нового оператора не предлагается.

## Два возможных новых контракта (пока не реализованы)

**A: общий fractional transfer пяти independent moments.** Вектор [P.B,C.R,C.G,C.B,C.A]; всеu8 независимы, C≤PB не требуется. Mixing: дляобщегоλ0..255 новыйa_j=floor(((255−λ)*a_j+λ*b_j)/255), новыйb_j=a_j+b_j−новыйa_j. Каждый total сохраняется точно; значения bounded, floor/ceil пары монотонны. Поэтому RGB≤C.A сохраняется, если является input invariant. Advection переносит floor(source_j*λ/255) всех пяти каналов; один integerλ ограничен capacity КАЖДОГО receiving channel. Можно найти максимальныйλ прямой целочисленной формулой каждого канала, без GPU search. НулевойP.B с положительнымC.A допустим как normalized-record semantics; C.A0 приRGB>0 требуется явно классифицировать, не делить на ноль. Физически это совместное движение canonical records, а не утверждение, чтоPB равен optical mass. Та же4pass/40byte схема; новые5 capacity checks/pair, не новыйbuffer.

**B: два независимых carriers.** PB — отдельный scalar; C.A — opticalcarrier, RGB перемещаются долями opticalcarrier. Общая wet/direction/contact, но величины массового PB и opticalC flux вычисляются отдельно и ограничены соответствующими capacities. Каждый total сохраняется, деление поC.A требует явныхzero cases; цвета не должны перенормироваться черезPB. Это ближе к текущей independently normalized representation, но слабее связывает перемещение PB ицвета, даёт большеbranches/division и риск визуального рассогласования. Не подходит как молчаливый физический эквивалент.

Дляrootreview предпочтителенA как маленький deterministic bounded эксперимент: не меняет source fit и сохраняет ВСЕ moment totals. До реализации нужны решение по carrier meaning и actual RGB/CA audit; после — CPU proof, GPUoracle/invalid/zero/overflow, actual author/replay и сравнение со снимками. Ни один контракт сейчас не включён в Room.

## CPU proof и OFF WGSL candidate A

Root выбралA. CPU `wetBrushMomentVector.ts`:10000 deterministic arbitrary-u8 pairs сохраняют каждый5channel total, bounds и replay;5000 conditional RGB≤CA pairs сохраняют эту условную инварианту. НулевойPB инулевойCA сpositiveRGB разрешены: оператор не объявляет неподтверждённое соотношение optical records обязательным. One-full-component capacity fixture ограничивает общуюlambda дляВСЕХ каналов. Source-fit counterexample принимается без изменения fit. Seven pair tests PASS; отдельный odd17×13/four-pass oracle иpartialROI/source-fit texture expectation также PASS.

`MOMENT_VECTOR_GPU_WGSL` — явный отдельный constructor specialization `diagnosticVector=false` поумолчанию. Старый shader literal/pack predicate остаются приOFF. ПриON pack принимает ВСЕ RGBA8 records; false C≤PB predicate удалён только из нового variant. Хранение/u32арифметика и4ordered passes прежние; ниsource normalization, ниcommonwet/contact/nib/deposition не менялись. Никакого hardware PASS новогоvector пока нет. Frozen5354/5355 не изменены. Standalone harness умеет помечать старый C>PB fixture как SUPPORTED в новом contract ипроверять positiveRGB приzeroPB/zeroCA.

## Первый vector hardware preflight и исправление API

Первый tiny Surface zero-rate arm frozen `ea859d8b` остановлен: auto pack layout удалил binding5 (atomic invalid), поскольку новый all-u8 contract не использует прежний C≤PB predicate. Encoder продолжал передавать binding5, поэтому validation отверг bind group/command buffer. Outputzeros здесь — invalid command buffer, НЕ свидетельство ошибки arithmetic или натуральности. Raw `temp/fast-watercolor-night/moment-vector-surface-20261008.json`, min/после1833MiB, owned target закрыт, остальныхarms/retry не было.

Исправление `12793301` задаёт explicitpack/unpack layouts только дляновогоvectorvariant, включая legally unused atomic slot. Никакого искусственного shader predicate. Старые defaultshader/auto layout остаются. Реальный VPS SwiftShader browser затем выполнил8tinyarms: exactCPUoracle/allRGBA/sums/outside0, errors[], включая sourcefit170/180/200 иzeroPB/zeroCA positiveRGB. Raw `temp/fast-watercolor-night/moment-vector-layout-software.json`. Это pipeline/layout preflight, не actual Surface proof или performance. Аппаратный повтор требует отдельного выделенногослота.

## Исправленный vector: Surface texture gate

Frozen source `16a63a31`, bundle SHA256 `d145f499e16fd214382c84300758b64ef47869940f6a2082f55610039c28e6aa`: все восемь actual GPU вариантов PASS. Zero full/partial in-place, coupled copy/in-place, source-fit P.B170/C.G180/C.A200 partial copy/in-place и zero-P.B/zero-C.A positive RGB partial copy/in-place совпали с CPU oracle побайтно. Все восемь сумм каналов P/C сохранены; за пределами ROI изменений нет; GPU validation errors отсутствуют. Старый недействительный bind-group прогон сохранён отдельно.

Raw: `temp/fast-watercolor-night/moment-vector-layout-surface-20261008.json`. Собственная страница закрыта; свободная RAM после закрытия 1796 MiB. Это проверка маленьких 17×13 текстур и контракта оператора. Натуральность картинки, реальный многодабовый Room, author/replay и скорость пользовательского рисования пока не подтверждены. Следующий gate — сохранённый actual 12-dab packed tape в отдельном frozen Room с DEV vector flag; существующие 5354/5355 неизменны.

## Actual Room: исходный 12-dab packed replay

Отдельный frozen `ab1dd3db` Room vector candidate выполнил сохранённый DB stroke без изменения packed bytes/params/ID. Structural fixture явно добавляет layer с original layerId до stroke: исходный export не содержал layer_add. Все ordinal0–11 supported/applied, auditMode gpu-vector, violations0. Canonical owner fields nonempty gate PASS, actual GL framebuffer и прозрачный whole export содержат пигмент (export alpha103425), errors[], lostfalse.

Raw `temp/fast-watercolor-night/room-vector-fixed12-surface-20261008/report.json`. RAM preflight2024/min884/после собственного закрытия1744 MiB. Controller atom `c7251b40`, runtime source `ab1dd3db`; source manifest SHA256 `7b4765198c3e0018a24890fb69a3c920c2ce20995ec673446c289e5caf6b88ea`. Существующие frozen candidates не изменены.

Это actual remote packed replay и устранение ложного carrier rejection на ordinal2. Не проверка live author/replay, не доказательство натуральности картинки, скорости или массовой/цветовой сохранности после последующего production fit/settle. Чтение полей и framebuffer диагностическое и влияет на wall time. Следующий независимый gate — live author и fresh original packed replay с одинаковыми recipe/fields/material/export.

## Actual live author: видимость подтверждена, fresh replay остановлен RAM guard

ONE controlled PointerInput short400 на том же frozen `ab1dd3db` дал12 retained contacts: все supported/applied gpu-vector, violations0. В диагностическом framebuffer после отрыва visible pigment35609 pixels, после settle37359; обе meaningfulPigmentVisible=true, GL0. Canonical author fields nonempty gate PASS; исходная новая author tape сохранена перед replay. Это наблюдение видимости, не физическая pen-to-photon latency/FPS.

Fresh replay НЕ запущен: после перехода собственной страницы в about:blank и2s retirement RAM938 MiB ниже обязательных1700. Guard сохранил FAIL/остановку; автоматического повтора и ослабления порога не было. RAM preflight1892/min735/после окончательного own close1884 MiB. Raw `temp/fast-watercolor-night/room-vector-live-replay-surface-20261008/report.json`; `original-tape.json` рядом. Full author/replay parity остаётся открытой. Controller `394c936c` + negative visibility/range tests `a918945a`; runtime/source не менялись.

## Отдельный saved-author replay: недействительный seq comparator

Разрешённый ONE fresh replay-only запуск дошёл до исполнения source, но controller остановился до readback comparison: original seq0 сталseq1 после явного layer fixture. Offline полный diff показывает толькоseq; packed bytes/ID/layer/preset/color/wash/timestamp неизменны. Это ошибка comparator, не render mismatch. Raw `temp/fast-watercolor-night/room-vector-savedauthor-replay-surface-20261008`; failure-original-tape сохранён. Собственная страница закрыта, RAM после1785 MiB. Автоматического повтора нет; fields/material/export parity пока не измерена.

`3884a6b6` исправляет comparator: толькоseq нормализуется как structural log bookkeeping, оба массиваseq записываются отдельно. Negative tests отвергают изменённые packed bytes/ID/layer. Source/render/runtime не изменены.

## Saved actual live author → fresh packed replay: exact PASS

Последний разрешённый instrumental retry на неизменном frozen `ab1dd3db` сравнил fresh remote replay с УЖЕ сохранённой живой авторской частью; авторский штрих не повторялся. All canonical role hashes, material records, retained recipes/rects и decoded whole transparent export exact.12 source contacts supported/applied gpu-vector, errors[]. Packed stroke параметры неизменны; seq0→1 записан отдельно, fixture layer действительно расположен перед stroke.

Raw `temp/fast-watercolor-night/room-vector-savedauthor-replay-fixed-surface-20261008/report.json`. RAM pre1916/min971/после закрытия1804 MiB; own target закрыт. Controller `90903e80` сохраняет fields/export до semantic verdict.

Закрыта конкретная bounded one-layer/one-tile short400 author/replay сцена нового оператора. Не закрыты натуральность, физическая latency/FPS, общий multitile/multiuser/undo, arbitrary gestures и влияние source fit/settle на физическую массу. Предыдущие RAM/comparator остановки сохранены и не объявлены model failures.

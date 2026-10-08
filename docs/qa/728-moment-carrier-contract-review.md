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

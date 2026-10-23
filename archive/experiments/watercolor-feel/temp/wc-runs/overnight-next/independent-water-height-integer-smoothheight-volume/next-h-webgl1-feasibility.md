# Отдельная H: план проверки возможности на WebGL1

Исследование, не решение внедрить новый движок. Контроль: `model-manifest.json` в этой папке, actual source23 postbrush4, исходное покрытие закрыто. Smooth volume-matched H имеет ΣH49710 и пик3.5288; carrier в crossing уменьшился52.13%, но это геометрический pressure proxy, не измеренная вода, и итоговый RGB пока не доказан лучше.

## Формат и стоимость памяти

Первый кандидат — отдельная RGBA8 запись H в двух каналах как unsigned16 фиксированная высота0..4: code=round(H/4*65535), R=highbyte,G=lowbyte. B/A резерв, не переиспользовать coverage metadata. NEAREST sampling; реконструкция float H=(256R+G)/65535*4. Шаг6.10e−5, максимальная ошибка3.05e−5 при отсутствии clipping. Пик3.5288 помещается, но clamp должен быть явным hard failure при записи >4, а не незаметной потерей. Этот диапазон калибровочный; не означает физическую единицу воды.

Для pair pingpong нужно2 RGBA8 текстуры. 512²:2MiB; canonical1536²:18MiB. Это НОВАЯ память, требует отдельной оценки на Samsung/iPad; ни один дополнительный1536 буфер сейчас не выделен. Нельзя обещать приемлемость только по теоретическим MB. Альтернатива одноchannel8 даёт шаг4/255=.01569 и заметно меняет small-gradient water flux; сначала CPU quantization sweep, не быстрый production shortcut. Float texture/render target не считать доступным по умолчанию WebGL1.

## Совместный перенос

Разделить donor physics и хранение: Hflux=.1 max(Hi−Hj,0), common fraction=Hflux/Hi. P/C должны читать одну pre-step H/P/C систему. Color-first, physical-second, H-last с одинаковыми коэффициентами и фазой; источники сохраняются до окончания всех трёх проходов. Никакого framebuffer alias. Парные disjoint face phases позволяют источник/получатель не расходовать ёмкость дважды и сохраняют code sums каждого из восьми каналов без repair. В каждом канале take=floor(q*fraction+ξ), общий ξ; min source/room guards. P.B=C.A сохраняется побайтно для исходно равных каналов; произвольные отношения восьми каналов округление НЕ сохраняет. CPU mean W/A ratio error≈.00956 не универсальная допустимая норма.

H integer flux должен вычитаться и добавляться ОДИНАКОВЫМ кодом на обоих концах ребра. Раздельно округлять H_new нельзя: это теряет воду. Нужен общий donor edge allocation, positivity bound и recipient capacity4. Приоритеты ребёр/фаз детерминированы. В существующем CPU H float moves Hi*fraction, а P/C integer rounding отдельно; GPU16-bit H — другой численный метод и требует нового CPU oracle, не скрытой equivalence claim.

Текущий общий P/C capacity limiter также блокирует ВОДУ из-за заполненного оптического канала. Это явно questionable constitutive coupling: отдельное движение H при заблокированном pigment более физически осмысленно, но меняет модель. Первый диагностический port сохраняет blocker для причинного контроля; второй отдельный эксперимент снимает его только для H и измеряет water/pigment decoupling, не смешивает результаты.

## Фаза и WebGL1

CPU uint32 avalanche не переносить буквально в GLSL ES1.00: integer bitwise/uint отсутствуют. Float32 имитация32bit products теряет low bits. Для первого oracle использовать табличную фиксированную phase texture на малой сетке либо проверяемую bounded float integer arithmetic с modulus≤251. Phase texture — дополнительный ресурс с явным budget, seed/version/hash; не новая бумажная текстура и не физический шум. Linear mod251 уже показывал diagonal dither; нельзя объявить его качественно равным hash. Возможный common-CDF code allocation без stochastic phase тоже диагностируется отдельно.

## Источники H, replay и undo

Геометрический proxy old/new max-ellipse product пригоден только fixture. Production H требует договорённости о смысле: фактически оставленная вода, расход кисти, испарение, вода в бумаге и отдельная высота на поверхности. Не выводить его из текущего P.A и не обнулять при новых washId без физической причины. Новое поле не может зависеть от wall-clock replay speed. Источник вычисляется из записанных dab t/pressure/size/wet и постоянных preset параметров; temporal evaporation по recorded timestamps. Scratch snapshot/apply, live chunk boundaries, rebuild/undo, checkpoint/restore обязаны иметь явный lifecycle. До этого production implementation не начинать.

## Минимальные проверки и работа GPU

1. CPU16bit oracle на actual4 source23: монотонный decode, отсутствие H clipping, positivity, EXACT Hcode sum и все8 P/C sum, source/target bound, PB=CA для этой fixture; разбивка phases и axis order в provenance.
2. Малый offscreen WebGL1 crop576×375: исходные P/C/cov hashes, Hinit hash, pre/post buffers, same closed originalA, zero pigment outsideA0. GPU/CPU сравнение всех кодов; каждый mismatch локализовать, не исправлять суммы.
3. Проверить actual202 integer-position disk и отдельно canonical201 pixel-centre disk; RGB/composite надо смотреть с тем же coverage, не только P.B.
4. Fixture3 и7: matched no-op bytes;4 два washId и declared same-wash контроль;6/9 расход воды/скопления без разрушения штрихов.
5. Реальные устройства: salted realcompile всех новых shaders, context/error/memory, отсутствие падений; desktop headless не достаточен. Shader complexity не добавлять в большой существующий fieldOp монолит.
6. Рабочая единица — одна complete paired P/C/H edge-phase + все copybacks. Distinct1×1 FBO readPixels до/после первых8 фактических units, полное время≤1000ms hard abort; отдельные whole-group budgets и draw-count, активныйrect/scissor. GLfinish только вспомогательный clock, не доказательство тайминга GPU. Sweep120×4 phases потенциально480×3 passes +copies — стоимость измерить прежде чем full1536 илиtablet.
7. Live/replay одинаковые immutable operations: pixel/code hashes после финала, undo/redo и checkpoint rejoin. Несовпадения source partition/spacing запрещают заявлять causal equivalence. Никаких обещаний FPS до замеров.

Критерий дальнейшего движения: реальный RGB центр4 становится ближе к фотографии без flat walls/hidden pigment; controls3/6/7/9 не деградируют, инварианты выполняются, ресурсные budgets измерены. Снижение carrier в CPU само по себе этим критериям не соответствует.

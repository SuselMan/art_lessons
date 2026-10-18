# Macro30: независимая проверка рисков перед расширением

Положительные предварительные timings не доказывают сохранение художественного поведения. t4 заменяет256 некоммутирующих phase на64; capped pressure и водно-зависимые exchange/absorption обновляются реже. Насыщение, узкие перемычки, мокрые углы и слабая вода могут отличаться существенно, даже при близком RMS.

## Поле: почему rate действительно ограничен

`macro14-stream-field.ts` сначала ищет maxDelta **неокруглённого** vertex potential по всем горизонтальным/вертикальным рёбрам, включая границы; выбирает power-of-two divisor с maxDelta≤256*divisor. Для целых v,u с |v−u|≤256d имеем |floor(v/d)−floor(u/d)|≤256. Последующее floor(strength*z/128), где0≤strength≤128, не увеличивает этот предел: разность≤ceil(256*strength/128)≤256. Это включает отрицательные значения и floor, а не усечение к нулю. Boundary vertices0 участвуют в normalization; shader использует те же zero boundary и encoded aux.w vertices. Все ненулевые boundary-adjacent рёбра включены в metadata scan; пропущенные крайние строки/столбцы нулевые.

При paper0..255 noise components bounded[-2048,2047], floor(second/2)[-1024,1023], terrain[-512,508]. Potential[-3584,3578], вычитание mean и taper не выходит за±7162; divisor/strength не увеличивают. Значит encoding+32768 не выходит изu16 и shader i32 decode безопасен. У текущего cfg strength64 rate фактически≤128; conservative macro30 bound256 также покрывает разрешённый максимум strength128. Seed805 — текущие сцены; валидатор разрешает весь u32, поэтому CPU sweep включает0/1/805/0xffffffff.

## Остальная арифметика

В actual initializer `absCap=8192+paper*64≤24512`, `0≤s≤absCap`, `w≤65535`. Поэтому head∈[-6128,67065], |dh|≤73193. Оригинальный неумноженный pressure numerator `dh*35*(1275−2maxPaper)+63750`≤3,266,301,375, ниже2³². t применяется **после** q0/meanW division; ранние q0 clamps остаются и мешают точной time equivalence, но не нарушают bound.

Absorption t4 denominator32 даёт absorbed≤2047. Первый rounded pigment numerator≤65535*2047+32767=134,182,912, ниже2³²; результат division≤65535, последующий *20≤1,310,700. Окончательный donor-color numerator≤65535²+32767=4,294,868,992<2³². Packet alpha/cap guards те же. Capacity backoff effective exchange120 до0 помещается в7 halvings. Нельзя переносить эти пределы на будущие W>65535/rate>256/t>4 без нового аудита.

## Ограниченный стресс-план

`macro30-stress-plan.json`:8 существующих flow-fixture IDs, t2/t4 для всех и t1 для4 boundary/stationary/saturated controls —20случаев, repeats3 с5сек паузой внеtimers. Water-only0, dry literal identity, opaque stationary, saturated W/A255, corner clipping, thin neck, water32/64 concentration и smooth lowwater fringe. Изменение начальной сухой маски не считается ошибкой dynamic water модели. Не смешивать это с static-wall contract.

**Пробел:** эти flow fixtures не содержат действительно слабого alpha-пигмента (основной alpha180/255). Soft case проверяет слабую воду, а не слабый пигмент. Faint native-blue нужен из уже существующей реальной mini/gallery серии; не утверждаем, что текущие8сцен покрыли его. До итоговой оценки нужны raw alpha/color ratios, исходные SHA, guards и actual sourceSHA, не только скорость/RMS. Coarse ledger сейчас может содержать лишь alpha/water: недоступные4channel device sums не выдавать за измеренные;4channel safety отдельно доказана CPU oracle.

# Smooth fine: адресный контроль явного 8px контура

Root actual V12 review: бумажное зерно появилось, но неподвижный coarse D сохранял клетчатый край. Это конкретный отрицательный визуальный результат, а не основание бесконечно множить модели.

Новый `macro17-smooth-fine-paper.ts` / `smoothFineDefinitions` / `wgsl-macro-mobility-smooth-fine-paper` использует прежний macro13 coarse mobility и fine conservative mobile exchange, но меняет начальную реконструкцию:

- M и D отдельно integer half-pixel bilinear, затем floor(sum/256), без final8bit на этом этапе.
- Только конкретный fine-пиксель с literal stationary alpha>0 использует прежний nearest M/D. Вся остальная страница не откатывается к nearest из-за одного stationary pixel.
- Fine D хранится в отдельной16MiB плоскости и остаётся неподвижен во время fine flow. Это новая непрерывная proxy basis для deposited, не сохранение исторического native физического D.
- Сумма двух floor alpha ≤floor интерполированной суммы≤65535 при bounded coarse M+D. Общие монотонные целые веса отдельно сохраняют premul для M/D. Literal добавляется только на безопасной nearest ветви.
- Actual init/pack guards остаются; никакого silent clamp. Координаты точно прежнего128→1024 halfpixel sampler. Final fine wet gate по nearest actual W+S сохраняется: bilinear carrier fringe может слегка зайти в соседнюю dry coarse клетку, там перенос не продолжается. Это реконструкция, не мгновенное смачивание.

Из-за floor и local nearest начальная fine сумма уже НЕ обязана равняться64*coarse. `initialFineMobileAlphaExpected=null`; metadata прямо требует сравнивать одинаковый init с0fine и12fine и сверять все4mobile суммы. Парный оператор после init сохраняет их точно. Дополнительного init GPU copy/read ради ledger не добавлено; после расчёта считывается прежний fine finalledger.

Контроли: steps256/fine12/gain3; steps256/fine0/gain0; steps256/fine12/gain0. Один и тот же coarse state и init нужны для причинного сравнения. Финальный safe display dither не считается физическим зерном. Общая extra fine memory около84MiB, включая16MiB ledger staging, поэтому нельзя называть вариант бесплатным.

3CPU PASS:100k bounded coarse packets с независимым floor-bilinear M/D дают premul+capacity; actual factory добавляет ровно16MiB и сохраняет old defaults, metadata qualification/lifecycle; shader fallback/layout/reserved проверка. Проверка поймала reserved WGSL имя `smooth` и оно заменено до реального GPU. TypeScript/lint PASS. Аппаратная компиляция и художественный результат ожидаются, автор GPU не использовал.

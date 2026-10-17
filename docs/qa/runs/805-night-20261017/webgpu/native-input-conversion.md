# Можно ли использовать богатый native Mini input в #805

Да, как **явно преобразованный benchmark**, не как тождественный физический вход старого solver. Ничего с GPU этим аудитом не извлекалось. Нельзя подставить native P или C как premultipliedRGB и назвать сравнение эквивалентным.

## Что в исходных полях

[Ring scratch:59–77](../../../../../apps/web/src/engine/src/buffers/RibbonStrokeScratch.ts): `inkColor.rgb` — optical depth, A — pigment mass. [pigmentOptics:41–62](../../../../../apps/web/src/engine/src/watercolor/pigmentOptics.ts): depth scale4, mixtureColor=exp(-D/m); это детерминированная Beer–Lambert rendering rule, не спектральная/измеренная модель. [Composite:1589–1600,1634–1635](../../../../../apps/web/src/engine/src/raster/shaders.ts) читает buffers×2 и depth×4. Для normalized rawC: **m=2C.a, D=8C.rgb**. P содержит deposit×water/deposit×wetness/pigment mass/deposit, не RGB ([shaders:1445–1448](../../../../../apps/web/src/engine/src/raster/shaders.ts)). P.b — пигмент, его нельзя выдать за воду.

Отдельный solvent хранит V/4 ([RibbonStrokeScratch:105–110](../../../../../apps/web/src/engine/src/buffers/RibbonStrokeScratch.ts)); [PuddleTarget:135–138](../../../../../apps/web/src/engine/src/watercolor/puddle/PuddleTarget.ts) объединяет local/foreign solvent. Нужен именно sum/clip по этому контракту, не coverage.alpha как замена воды. Paper — world-aligned height sample с origin/scale/texture size и Y-базисом ([WatercolorPasses:252–263](../../../../../apps/web/src/engine/src/raster/WatercolorPasses.ts)); исходный asset pixels без этих координат не равен бумаге поля1024.

## Два допустимых преобразования

1. Предпочтительный вариант для нового `encoding:'optical-density'`: output RGB=round(255·s·D/4), A=round(255·s·m). Единый **явный** s≤1 выбирается так, чтобы все каналы/масса помещались без clipping; записать s и clippedcount0. Если maxm≤1 и maxD≤4, s1 даёт примерно2×rawC bytes; простая подстановкаrawC без×2 уменьшит оптическую дозу вдвое относительно composite. При большом m нужен общий scale, значит это новое нормированное состояние, не прежняя абсолютная масса. Отношение D/m и пространственная фактура сохраняются до байтового квантования. Полная обратимость невозможна: native уже8bit/clipped.
2. Для premultipliedRGB: T=exp(-D/max(m,ε)), A=clamp(s·m,0,1), RGB=A·T. Это корректный premultiplied tint/mass proxy, но нелинейно теряет subtractive mixture: усреднение RGB не равно сложению глубин. Не выдавать за перенос физических P/C. Native composite также использует densitycurve, локальныйthin-depth prior и бумажную фактуру; такого exactRGBA-reference эта конверсия не обещает.

Water mapping: записать physical V=4·(combined solvent A); общий water8=round(255·V/4) сохраняет raw fraction/текстуру. Тогда water1 нового input означает nativeV4, не nativeV1; записать unit4, не скрыто перенормировать каждый рисунок. Paper можно оператором один раз получить в том же world sampling→R8, либо CPU-сэмплировать исходные uploaded bytes с тем же UV/filter; R8 округление LINEAR-height уже новая квантизация, допустимая для commoninput, но не exact nativefront. Не брать бумагу из готового скриншота (там tone/gamma/composite).

## Практическая рекомендация

Два уровня: (а) улучшенные **детерминированные generated material fixtures** с независимой водой, пятнами концентрации, остановками/сухими волосками/разными пространственными масштабами — всем алгоритмам одни bytes; (б) один captured native raw C+solvent+world-height из нового owned Mini context, в одном пред-goal состоянии, с conversion manifest/inputSHA и original raw hashes. Не трогать пользовательский рисунок; capture/readback только вне timing, captured immutable input затем повторять без Mini. Для quality важнее optical-density encoding, иначе синий+жёлтый тестирует RGB-модель вместо пигмента.

Сравнение каждого алгоритма делать с **common input renderer**, не требовать совпадения с прежним native финалом. Старый Mini остаётся отдельным художественным ориентиром с собственным rawinput+composite. Новые модели пока не воспроизводят его deposit generation/грануляцию/пороговые пики: красивые synthetic flatcapsules недостаточны для вывода о победе качества, а rawcapture без обоснования единиц тоже не исправит сравнимость.

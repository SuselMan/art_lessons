# Bounded paired preview transport

## Изолированный oracle

`BoundedPairedTransportOracle.mjs` — CPU-only helper, никаких импортов engine, default runtime не затронут. Общие четыре donor fractions одинаковы для всех8 P/C moments. Их сумма≤1; запрещённый переход через dry barrier/ROI boundary возвращается в donor. Zero fractions дают byte-exact t0. Синтетическая радиальная капля24 steps сохраняет массу/одноцветный ratio, растёт второй момент: это перемещение вещества, не alpha dissolve. Four-axis anisotropy остаётся ограничением, художником результат не принят. Canonical endpoint oracle не вычисляет.

## Бюджет

| ROI | PairedRGBA32F ping-pong | 4float flux coefficients (если хранить) | RGBA8 wet/support | 5tap moment reads+writes/step |
|---|---:|---:|---:|---:|
|128²|1MiB|0.25MiB|0.0625MiB|3MiB|
|256²|4MiB|1MiB|0.25MiB|12MiB|
|512²|16MiB|4MiB|1MiB|48MiB|

Это нижние оценки, не измеренный GPU performance. Immutable highQ8 source существует у owner; при source-only sampling нет новой полной source копии. Два render outputs WebGL1 получают одинаковые fractions, выходы не становятся входами друг друга. Output material можно писать в уже существующий1024 pending, соблюдая original.copy/rebind. Понадобится world-origin/scale binder: прежний shader hardcoded128 whole-world тут не подходит. Сканирование fullGPU source ради bbox через readPixels не годится в интерактивном пути.

## Admission/padding

ROI выбирается из conservative source geometry (dabs/ribbon + уже предусмотренный spread), расширенной на строго ограниченный travel за2 секунды, material sampling footprint и texel margin. При inkSmooth88 ring radius44 плюс local colour prior2/linear sampling1: минимум47px материала сверх transport support. Плюс max migrate/spread footprint из actual recipe, пока не доказанно bounded. Нельзя строить ROI только по одному яркому ядру, теряя лёгкие хвосты.

При допустимой скорости40worldpx/s за2s travel80px. Требование halfROI≥sourceRadius+80+47.128 почти никогда не подходит этому режиму.256 подходит sourceRadius≤1px;512 sourceRadius≤129px. Для sourceRadius200 (кисть400)512 уже недостаточен — нужно меньший обоснованный travel, расширяемые sparse tiles либо admission отказ. Не обещаем, что16MiB покрывает любой штрих400.128 может быть полезен маленькому пятну при медленном ограниченном travel; material padding уменьшит полезное ядро.

CFL step fractions sum≤1 обеспечивает positivity. При фиксированной сетке/одном соседнем step скорость ограничена worldTexel/dt; увеличение dt требует substeps, а не более1 outgoing sum. Short clamp длительности — ограничение preview, не изменение canonical.

## Frozen границы

Нулевой flux через ROI сохраняет массу, но отражённая краска скапливается у границы, даёт квадрат и ложную кайму. Oracle явно считает rejectedBoundary. Admission должен гарантировать, что front не достиг границы; если rejected flux > допустимого numerical tail — результат недействителен, нужен resize/tile-admission. Не маскировать это opacity fade. Grow требует conservative transfer полей в новый origin и повторной проверки budget; нельзя молча clip/crop либо заморозить всю сцену.

Dry connectivity — отдельное ограничение. Два соседних мокрых пятна не соединяются общим sourcebbox. Donor edge допускается только через соседние wet клетки, с одинаковым правилом для P/C. Low wet mask нуждается в conservative mapping, иначе получится утечка между лужами.

## Handoff/качество

Материал в t0 должен пройти wholeviewport exactsource gate. Transport preview canonical не меняет; canonical published image остаётся endpoint. Endpoint difference preview→canonical и actual final reveal frame сейчас НЕ доказаны. Даже mass/ratio exact не гарантируют match этой конечной картинке.

Следующая аппаратная проверка после allocation: один fixed water→pigment source; минимальная snapshot after owner2 land+canonicalpendingfalse; отдельная final snapshot через≥2с после публикации только при reveals0/active stroke0/settle0/rebuild0. Гейт должен ждать bounded completion (например15с после owner2 publication) и записывать actual timestamps/reveal hold/remaining. Если deadline вышел — OPEN/FAIL с причиной, а не кадр во время overlay. Требуется graceful finally owncontext/process cleanup и compactreport. Старые finalFilmstrip.frames[] не засчитываются.

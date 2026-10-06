# Диагностический независимый solvent V (#680)

Принцип: доступная жидкость и нанесённый пигмент имеют разные диапазоны хранения.
Вода не должна сжимать pigment/depth через общий FIT RGBA8. Прототип выключен
по умолчанию (`RibbonStrokePainter.diagnosticSolventField`); формат операций не меняется.

V измеряется в единицах полностью загруженного контактного водного фильма. RGBA8
хранит V/4 в r/a: максимум4, шаг4/255. Внутри жеста source MAX, между жестами
base+film ADD с собственным cap4. Источник использует записанную геометрию и
существующий waterByDab, без pigment excess/cloud/granulation. P и optical depth
сохраняют прежние единицы и источники. Диффузия читает concentration2*P/V вместо
legacy carrier alpha; цветовое отображение отдельно не меняется. Это статический
V для проверки accounting, не полноценный solver переноса жидкости.

На настоящей Vega восемь isolated GPU случаев: actual15 direct/prewater47→48 и
100 direct/prewater, каждый V off/on. До settle inkLoad/strokeInk/inkColor/strokeColor
побайтно одинаковы. Поэтому дополнительная вода не уничтожает P/depth в FIT.
После settle integrated P отличается от off на −0.31% prewater15, −0.33% direct15,
+0.006% direct100 и −0.029% prewater100; RGBA8 transport пока не обеспечивает
универсальную conservation. Материальный base+film сам тоже может переполниться.
V source max0.973 у direct и2.008 у prewater, saturated pixels0 в этих случаях.
Предварительная вода становится ровнее, direct сохраняет мраморный хвост:
существующая source policy делает purewater bottomless, coloredwater finite.
Поэтому это не доказательство окончательной визуальной parity.

Fixed lifecycle QA на Vega: семь load/rebuild PNG exact (actual15 пара,100 пара,
purewater,drycontact,dry-on-existingwater); chunks whole/1/3/7 одинаковые coverage,
P/depth; patterned V GPU fixture snapshot/restore, spill/unspill и next-film base
побайтно exact. GL0/contextlost false. MockGL проверяет ownership pending settle
при уничтожении и запрет spill активного V film. Пять diffuse samplers в пределах
минимума WebGL1 восемь. Дополнительная память12MiB на1024 tile во время film,
4MiB persistent V/tile,9MiB canonical1536 field,4MiB/tile в checkpoint.

V field принадлежит scratch/wash: иностранная wetness/contact маска пока не
импортирует V другого wash. Root Samsung QA выполнен на фиксированном source: direct100, prewater15 и dry-on-water того же wash. Во всех трёх 26 холодных link, 0 failed, GL0/contextlost false, сухой PNG append/rebuild побайтно одинаковый. Отдельная вкладка с уникальным QA URL закрыта после проверки. V не переносится
с expanding water front: во fringe возможна wet coverage без V, блокирующая
последующий перенос P/V. Нельзя заполнять fringe константой без water accounting.
Не изменены pickup/self-refill, политика расхода кисти и current-stroke wet sampling.
Поддержка сохранения V — необходимый accounting шаг, но ещё не общий fluid solver.

Воспроизводимые артефакты (не Git): temp/solvent/first, first-comparison.jpg,
summary.json, rebuild-report.json, slicing-report.json, state.mjs/state.json.

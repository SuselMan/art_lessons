# #728: аудит первых stage snapshots

Root Surface gate: prepare scalars/bounds exact, sourceV exact, source coverage
29 байт/max1, P447/max3, C270/max3; frontSeed exact, firstfront2/max3;
firstdiffuse15668/max30, firstbrush4819/max197. Author→packed-native exact0.
Это аппаратный результат конкретного100 zigzag; input batching в нём исключён.

## Сопоставимость операторов

Hooks вызывают настоящие исходные методы, не обходят planner. Front destination
— аргумент5; diffuse destination —7; brush output —5 в обеих ветках. Общий planner
при paired colour вызывает **colour сначала**, потом pigment. В выбранном
одноцветном100 zigzag paints.size=1, colour=null: `first:diffuse` — P в обеих ветках.
Прежняя формулировка о C была чрезмерным обобщением paired ветви. Первый brush тоже определяется реальным source===color,
а не догадкой по названию. Prepare metadata не доказывает равенство всех inputs
последующих fieldOps: они успевают изменить поля до первого diffuse.

Обнаружено ограничение старого brush oracle: full output включал texели вне
production scissor, которые этот оператор вообще не записывает. Reused scratch
вне rect может иметь разные старые значения; max197 там не доказывает ошибку
brush. Новый oracle сравнивает только фактически written GL scissor и отдельно
отклоняет разные rect. Full final layer остаётся прежним whole comparison.
Контроль top-row↔bottom-up rect с poisoned outside проходит.

## Минимальный следующий gate

Тот же100 fixed tape, `runEndToEnd({size:100,stages:true})`, с расширенным observer:
перед первым diffuse сохраняются source record и gate, затем output. Primitive metadata
содержат field extent, origin, scale, paper size, radius/preparedRadius, knight,
sourceRole и source/gate filter. Front/brush также сохраняют свои реальные scalar
arguments/channel/rect. Ограничение snapshot памяти96MiB, readback после расчёта;
это diagnostic observer, не timing benchmark.

- Если input record/gate уже сильно различаются, firstdiffuse не установлен как первый
  виновник; искать предыдущую remobilisation/front-band/fieldOp chronology.
- Если input record/gate и prepared primitive metadata exact, а output нет, следующий
  gate — один actual diffuse с **одинаковыми frozen inputs** на GL/native, тот же
  Fine baked/origin/S/radius/knight и all-channel output. Отдельный B=0 диагностический
  arm (не изменение модели) проверит влияние height/bilerp: не считать его proof
  исправления и не включать в продукт.
- Если brush difference исчезнет внутри written scissor, прежний max197 был
  неполным oracle. Если останется, сначала сверить P/C/flow/water inputs/gain/role.

GL paint path использует paper LINEAR, а compose mip filter восстанавливает его.
Native paperAt manual bilerp соответствует raw asset row convention; adapter
origin/texSize/radius formulas совпадают с WatercolorPasses по исходникам. Это
ещё не bitwise filtering proof; hardware bilerp precision и arithmetic могут
пересечь Q8. **Пока нет доказанного исправления kernel**, поэтому модель не менялась.

Observer tests3PASS: сохранение аргументов/returns, copies immutable/readback deferred,
restoration; missing/changed alpha/extents; scissor-only с poison/outside и Y conversion.
Эти tests CPU-контракта не заменяют actual hardware stage gate.

## Уточнение после refined Surface gate

Root refined100: diffuseInput7211/max126, gate28/max58 уже отличаются;
output15668/max30. Primitive args/filter/channel совпали, sourceRole=pigment.
Written brush2252/max51 после исправления scissor oracle. Следовательно большая
разница возникает ДО diffusion; manual paper bilerp в diffuse пока не локализован
как причина. Следующий coarse cohort описан в harness README (`stages:'prediffuse'`),
не смешивается с прежними snapshots, сохраняет тот же author control и physics.

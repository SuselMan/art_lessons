# #728: когда scissor сокращает GPU pixels без изменения результата

Отчёт, не реализованное изменение. Источник модели f7dc9c3d;
WatercolorSettlePlan, WatercolorPasses и shaders.ts. Нельзя просто scissor
каждый pass по bounds последнего штриха.

## Формальная достаточная проверка

Для каждого выхода RGBA8 нужен конкретный baseline-фон B_i(p), не предположение
«снаружи всё ноль». Пусть D_i содержит все pixels, где вход i отличается от B_i.
Для локального оператора F с offset set N_j источник j нужен в p+N_j.
Изменение результата возможно только в R = union_j(D_j ⊕ (−N_j)), если также
F(B_1,…,B_n)(p)=B_out(p) вне R. Сначала обязательно обеспечить, что destination
уже содержит B_out вне R. Тогда scissored F на R сохраняет всю текстуру.
Q8 применяется в обоих случаях тем же draw, никакого объединения iterations.
Индукция повторяет это для каждого ping-pong шага. Bounding rectangle вместо
точного D допустим как надмножество; позиция rect должна учитывать bottom-up GL.

Ключевая опасность: destination хранит результат другой, предыдущей итерации.
Снаружи нового rect он должен совпадать с текущим baseline, а не просто быть
некогда очищенным. Для float-filtered inputs halo включает соседние bilinear
texels. Ширина halo — offsets текущего оператора, не ширина кисти.

## Применение к конкретным проходам

### diffuseStep — наиболее простой физический оператор

Если исходный deposit/colour вне R нулевой и там нет incoming flux, результат
там также нулевой. Для axial/diagonal stencil reach в infinity-norm = radiusC;
для knight stencil = 2*radiusC. Без знания закрытых water faces достаточно
расширять поддержку на эту величину на каждом шаге; кумулятивный bound — сумма
reach по всему schedule, clipped к настоящим field dimensions.

Можно уточнить поддержку пересечением с domain, но domain coverage меняется
при water-front extension и remobilisation; использовать неизменную старую
gesture coverage нельзя. Гарантированный простой кандидат — вычисленный CPU
консервативный общий rect из всех stitched pigment sources, затем полный
schedule halo. Не только bounds текущего dab: old paint remobilizes из overlaps.
Перед первой sparse записью обе ping-pong textures должны иметь нулевой фон;
между settle owner epochs support tracking сбрасывается. Если rect почти всё поле,
ничего не срезать. Требуется сравнить все промежуточные RGBA8 fields, не только PNG.

### waterFrontStep — исторически опасное место

_cost.r вне исходного seed обычно 1, а не 0. Кроме r shader всегда пишет .g =
paper height и .a = 1. Обычный zero-clear вне scissor подделает достижимую нулевую
стоимость и пустую height; это объясняет описанные в _diffuseFieldFor артефакты
(§17.70: scissor boundary wall и разница до127levels).

Теоретический exact подход: для каждой outward/inward серии отдельно установить
полный правильный background обоих ping-pong buffers, включая paper-height g,
b/alpha; затем ограничивать изменения cost его доказанной support. Два первых
полных шага могут дать обоим buffers нужный invariant background — но это надо
проверять для каждого seed mode и последующих readers. В outward положительный
floor ограничивает распространение cost reach: expansion определяется sum strides,
а не только budget. Inward seed — complement domain; фон иной (cost0 снаружи),
поэтому reuse outward support/proof без повторной проверки недопустим.

Показать только финальный band не достаточно: mode6 читает cost/height, а следующий
проход может читать ранее неиспользованную область. Размер field сохраняется1536²,
UV/texture clamp не меняются. Нельзя заменить физическую texture меньшим rect.

### fieldOp modes

Pointwise difference/add/absorption (0/1/2/3) могут писать union support входов,
если nonlinear WC_FIELD_FIT и fibre branches сохраняют нулевой фон и target
внешний фон установлен. Mode5 binomial blur расширяет поддержку на u_dir strides;
несколько à-trous проходов требуют сумму offsets, включая bilinear filtering.
Cost/seed/mask modes (12/19 и другие) имеют ненулевой либо pixel-dependent фон;
их нельзя объединять с этой нулевой ветвью доказательства.
Carry modes15/16 читают directional/path/domain records и могут переносить pigment
за gesture rect. Для них нужен отдельный directed-offset bound каждого stride.
Не вводить универсальный scissor в fieldOp без таблицы mode-specific baselines.

### brushPass / wcResample / copies

brushPass уже scissored по contact rect + canonical one-texel halo. Оба records и
copy-back покрывают один halo; обрезать его по shape/dab видимой границе опасно:
face flux может пересечь границу flow или pigment. Больший gain здесь требует
доказать disconnected faces, не общего stroke bbox.
wcResample уже пишет ровно overlap scissor. Его дальнейшее сокращение требует
knowledge изменившегося new−old, включая bilinear footprints, иначе теряется grain.
copyRegionInto уже rect-limited. Direct nonalias landing убирает copy без изменения
region и потому имеет существенно более простой proof (кандидат2490c018).

## Практический следующий эксперимент

Начать с zero-background diffuseStep; держать field sizes и schedule неизменными.
Добавить OFF-флаг, CPU conservative support rect и counters fullPixels/scissoredPixels.
Никаких readPixels для вычисления support; они синхронизируют GPU и меняют workload.
Если captured sources bounds неизвестны, fallback full field. Добавить poisoned
outside destination fixture, две parity branches, max-radius knight, cross-tile,
foreign puddle remobilisation, repeated epochs. Аппаратное сравнение intermediate
fields и finalPNG до измерения скорости. Water-front sparsity отложить до явной
background model: его «математически естественное» ROI уже ломалось исторически.

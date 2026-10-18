# Неподвижная исходная вода: три протекавших GL-семейства

Это opt-in `createFixedInitialWet` для StableFluids, lattice diffusion, artistic-front и24 DSL-программ. Обычный `create` сохраняет прежние shader bytes и порядок вызовов; `config.fixedInitialWet` строго0/1, DSL получает конфигурацию без внутреннего флага. Меняется алгоритмическая политика, не входные RGBA/water/paper/seed и не перечень параметров варианта.

## Геометрия и перенос

CPU partition использует **фактическую** сетку модели128/256/512, то есть8/4/2 исходных пикселя на coarse-ячейку. Bulk допускает только ячейки, где каждый исходный water byte>0. Остальные мокрые пиксели сохраняют исходную краску в подвижном full-resolution tail, сухие — literal. aux.b до включения не используется ни одним из трёх семейств: source guard отвергает обнаруженное чтение этого канала/повторную трансформацию. aux.r/aux.g сохраняют прежний смысл воды/бумаги.

Lattice и artistic/DSL проверяют полный coarse-путь каждого stride≤8, включая обе боковые клетки диагонального угла. Независимый CPU тест перебирает все смещения±8 и проверяет покрытие каждой клетки, пересекаемой прямым отрезком. Costfront и transport заблокированы структурно, а не только последней маской.

Stable использует стенки в силе/скорости, project/pressure/divergence и pigment. Каждая из четырёх bilinear donor-точек проходит path gate; запрещённый вес возвращает собственное значение, без перенормировки. Neighbor average также gated; pressure на закрытом лице использует собственное давление, скорость поперёк закрытого лица обнуляется. Это по-прежнему исходная приближённая RGBA8 StableFluids-модель, не доказательство несжимаемой жидкости.

## Реконструкция и тонкие линии

Nearest bulk исключает bilinear halo через сухой край. Для partial wet берётся исходный RGBA, dry fine-state равен нулю. Затем12 cardinal parity проходов на1024: H-even/H-odd/V-even/V-odd. Пара открыта только при двух исходных water>0. ВсеRGBA получают общий обмен64/256 с симметричным целочисленным округлением; alpha capacity255 и premultiplied порядок сохраняются. В том числе при одинаковой alpha разные цвета обмениваются. Квантование пары — exact byte arithmetic с произведением≤65280, без float накопления суббайтовой массы.

Сухие байты восстанавливаются из literal original; это не удаление вышедшей краски output clip: coarse не содержит partial/dry материал, а fine никогда не переносит его в dry. Тонкие линии1/2/7px остаются подвижными. Горизонт12 локальных проходов ограничен примерно6px по каждой оси; это не обещание быстрого переноса на всю длину тонкой линии.

Прежние bulk advection, rim multiplier и UNORM могут менять глобальные суммы, как и раньше. Их нельзя объявлять консервативными благодаря точному fine tail. Metadata отдельно сохраняет raw bulk/partial/literal суммы и coarse reduction quantization delta; GPU mass acceptance требует отдельного сравнения, а не суммы одной картинки.

## Ресурсы и проверка

Дополнительно3 full RGBA8 target =12MiB: rawAux и fine ping-pong. Tail14draws заменяет прежний publish1draw, итого+13. Все ресурсы принадлежат тому же GPU owner, его catch/destroy убирает и tail. Никаких extra readPixels/glFinish/скрытой GPU-валидации в модели. Actual compiled source texts попадают в metadata; worker считает SHA **после** измерений и удаляет длинные тексты из отчёта.

CPU:5 geometry/partition/pair tests,100000 random pair ledgers;5 actual-source/factory tests (default vs historical shader/draw equality всех3 семейств,24DSL, sampler lookup/binding,12 tail phases, compile-fault cleanup). Strict TypeScript/oxlint0. Это не реальная компиляция GL shader и не GPU PASS: первый device batch —4 представителя×3 сцены по отдельному plan, затем только при успехе расширение на все конфигурации.

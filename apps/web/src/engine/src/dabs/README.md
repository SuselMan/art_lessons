---
layer: engine-internals
summary: дабы и геометрия следа
adr: [012-tip-footprint-geometry, 004-marker-tool, 003-liner-tool]
tags: [геометрия, штрих]
---
# engine/src/dabs — дабы и геометрия следа

Как штрих превращается в дабы: сплайн Catmull-Rom, шаг между дабами, отпечаток кончика, профиль
ленты для маркера и линера. Форма даба по инструменту (`dabShaping.ts`) — в `presets`: это
таблица характеров, и пресеты на неё опираются.

Здесь же — как дабы ложатся на холст (#494): `StampPainter` штампует карандаш, ластик, линер и
уголь (инстансинг через ANGLE_instanced_arrays и запасной цикл по униформам), `SmudgePainter` —
растушёвка и микс-кисть, `BrushPainter` — цифровая кисть на модели штампа (штамп в покрытие,
композит поверх замороженного слоя, её «цифровая акварель», битмап-кончики и текстуры),
`dabOpacity.ts` — запекание непрозрачности даба до отправки и отрисовки.
Лента маркера, кисти-пера и акварели пока в движке.

## Заметки

- «Штрих выглядит не так» → сначала расшифруй записанные дабы, потом строй теорию.

`RibbonStrokePainter` готовит и наносит один пакет ленты: форму, дозу воды и
пигмента, полосы, отпечатки и композит. Его генератор сохраняет прежние границы
выдачи управления. GPU-примитивы и публикация композита текущего кадра приходят
через контекст; очередь операций, кэш заливок и история принадлежат движку.
Чистые вспомогательные расчёты лежат в `ribbonStrokeMath.ts` и используются также
низкоуровневыми проходами движка.


Импортированная кисть может явно выбрать `behavior.spacing.mode = kritaAuto`.
Тогда `DabSystem` при создании нового штриха применяет коэффициент к размеру
после давления и динамики: линейно до1px, через квадратный корень выше.
Как в `KisDistanceInformation`, каждая ось шага ограничена снизу0.5px; обычные
ограничения Grafetto на1px, nominal-spacing, scallop и кривизну этот режим
не подменяют. Эллиптический шаг учитывает базовые размеры кончика и его
поворот. Состояние динамики и фаза принадлежат жесту, копируются в prediction
и восстанавливаются после peek. Replay использует сохранённые дабы без
повторного вычисления spacing. Скоростные датчики на этапе sampling используют
измеренную скорость входного пакета; исходный `t` записи не меняется.
Сверка с Krita на кривых и скоростных датчиках остаётся отдельной проверкой.
Источник правил: pinned Krita `kis_paintop_utils.h::calcAutoSpacing` и
`kis_distance_information.cpp::MIN_DISTANCE_SPACING`, ревизия7351561e.

`BrushTextureCache` ограничивает резидентность масок и зерна каждого painter
по байтам, а не количеству изображений. Оценка включает все mip-уровни как
RGBA8; цель —16MiB. Перед загрузкой защищается текущая группа семплеров
(primary, grain, dual и используемые оптические текстуры). Если сама группа
больше цели, она сохраняется целиком; неактивные LRU-ресурсы удаляются до
`max(16MiB, activeGroupBytes)`. Защита сохраняется до следующей группы.
Загрузка восстанавливает активный sampler, его binding и UNPACK_ALIGNMENT;
FBO не меняет. Попадание в кеш не пересчитывает CPU mip-chain.

`PencilEngine.prepareBrush(preset)` подготавливает только выбранную кисть после
загрузки исходных pixels: полный набор её кадров и реально используемые sampler
маршруты stamp/wet, включая independent child. Бюджет проверяется до CPU mips;
свыше16MiB сохраняется ленивый путь. По одному отсутствующему texture за rAF,
готовый набор возвращается без rAF. Подготовка не рисует и не меняет историю/RNG.
Смена выбора, abort, context loss и destroy отменяют оставшиеся jobs. `ready`
подтверждает текущую резидентность, но последующий чужой replay может её изменить;
если replay вытеснил ресурс ещё во время jobs, результат `skipped` включает обычный
ленивый fallback без бесконечных повторов. Room держит input lock до окончания
assets/publish/prepare; короткий context loss тоже сбрасывает readiness.

Синхронный paint batch получает короткий texture lease на кадры своей brush family:
это сохраняет уже resident будущие кадры при последовательном scan и нескольких
ceiling/coverage/tile passes. Lease admission (включая вложенный independent child)
не превышает те же16MiB; завершение/ошибка снимает pins через finally. Oversized
family остаётся на lazy LRU. Непредвиденный current draw вытесняет optional lease,
поэтому прежняя граница max(target,current draw working set) не увеличивается.
Это снижает cyclic-LRU amplification, но не обещает удержать одновременно две
animation family, суммарно превышающие бюджет; recorded draw order не меняется.

Texture.application выбирает общую GLSL операцию multiply/subtract hard/soft над
маской до flow/opacity. Нет application — прежний grain shader остаётся прежним.
`brushTextureApplication` задаёт общий NPOT grid/мировую фазу для stamp, mixer и
inline dual; independent child использует stamp renderer. Offset вычитается,
random заменяет fixed отдельно по осям и стабилен в пределах gesture. Grid texels
лежат в верхнем левом углу padded POT asset и читаются NEAREST без mip levels.
Отдельный `g:grid` GPU cache key позволяет одному asset одновременно иметь legacy
LINEAR+mips и discrete samplers. Prepare/leases учитывают обе реально нужные
версии и base-only bytes grid, сохраняя существующий бюджет. CPU/GPU readback
для этой операции не используется; численная vendor byte equivalence проверяется
отдельным native/device сравнением, не MockGL.

Опциональный `mixer.sampling: { mode: 'uniformMean', radius }` дополняет только
чистый `previousCanvas` (load/initialLoad0, безwetMix). Вместо пространственной
patch `SmudgePainter` усредняет предыдущую область отдельным pooled1×1 GPU-pass:
integer rect/radius, округлённые Halton2/3 texel centres, максимум64 samples.
На областях больше512px gather уменьшает разрешение; native adaptive sampling,
цветовое пространство и byte-rounding не считаются точно воспроизведёнными.
First contact, порядокscatter/chunks иCOPY/OVER общие с пространственной веткой.

`mixer.source=previousCanvas` optionally adds foreground paint to its sampled
premultiplied source before transfer: `B=Over(F*b,A)`, with
`b=foreground.rate*dynamicProduct*effectiveDabOpacity`. Its rate already contains
the importer-computed configured-smudge prefactor; dynamic pickup never changes
that prefactor. Final transfer independently uses `mask*pickup*effectiveDabOpacity`.
Absent foreground keeps the pure previous-canvas branch unchanged. The RGB comes
from the placed stamp, including its existing HSV dynamics. Sampling radius and
foreground controls use separate deterministic hash namespaces and read logical
state before placement advances it; neither depends on travel, paper or density.

Explicit scatter placement can use a uniform path interval, its perpendicular
normal interval, or an independent world-axis square. Path direction comes from
recorded movement, independent of tip rotation. Extent uses pre-scatter configured
size times scatter radius (no half-diameter conversion); exact native integer
rotated-mask dimensions remain an approximation. Absent placement preserves the
historical disc/projection path and its random streams.

Source spacing may explicitly use the diameter law or the existing Krita-auto
square-root law. Optional spacing sensors multiply the resulting characteristic
axis distance before each axis's 0.5px floor; they do not alter dab size. Their
codec-clock/directional inputs read the isolated spacing state before advancement.
An isotropic option selects the largest characteristic axis with no tip rotation.
Axes remain continuous rendered dimensions rather than native integer mask bounds.
Preview forks deep-copy spacing controls; historical absent fields retain the old law.

# #728: следующие проверки нового brush transport

Сейчас доказаны bounded Q8 operator conservation на восьми 17×13 texture fixtures и exact live short400 → fresh packed replay (12 retained contacts, один слой/тайл). Сохранённый wetmix OFF — только reference: clear water, purple, yellow. ON wetmix ещё не выполнен. Качество новой модели из OFF не следует.

## Перед приглашением Ильи

1. **Поддержка цветов/воды:** ONE отдельный fresh ON wetmix, source ab1dd3db и те же held400 world points/presets/palette, без DryAll между водой и цветами. Все реальные reports supported/applied/gpu-vector; original source/contact ordinal/recipe сохранены; GL0/lostfalse. Pure-water видимая мокрота и ненулевой pigment export. Compare side-by-side со СУЩЕСТВУЮЩИМ OFF, никакого требования equality между моделями. Carrier-bound validation не равна сохранению массы после independent production fit/settle.
2. **Движущаяся кисть:** held wetmix проверяет локальное mixing, но direction у held contact нулевой — им нельзя доказывать перенос по ходу кисти. После первого gate нужен отдельный identical fixed tape OFF/ON с коротким pigment drag по уже лежащему мокрому двухцветному пятну. Record nonzero recipe x256/y256, сравнить движение центра цветового tracer/локальных деталей и отсутствие checkerboard/rings/cursor square. Не полный zigzag/gallery. Использовать один origin0 bounded tile1024; fixture bounds не обходить.
3. **Непрерывная видимость:** во время live drag новый пигмент должен быть виден до отрыва, не только после settle. Нужны кадры в ходе движения и после lift; старый proof видел pigment после lift. Убедиться, что zoom и следующий contact не убирают изображение, вода остаётся общей для own/prior deposition.
4. **Отзывчивость:** отдельный не-readback cohort, CPU input/first-display/rAF/queued-source counters, без screenshot/readPixels/GPU queries в timed секции. Input→display callback не pen-to-photon; physical FPS/latency потребует реального пользовательского пера. Отдельно canonical jobs drain/source publish и память, без суммирования inclusive times.

## Что уже показывают markers

Saved live vector short400:12 source publishes, observed async method wall median26.4/max107.4ms; emitPrepared median2.2/max8.6ms. Wetmix OFF:3 publishes median14.8/max39.5ms. Эти разные сцены, callback instrumentation и диагностические readbacks НЕ дают paired gain/physical latency. Значимое неизвестное: количество GPU/GL publication roundtrips и влияние на первый/следующий мокрый contact.

## Точный следующий ONE cohort и бюджет

Запустить только ON `QA_SCENARIO=wetmix400`, QA_MOMENT=1/QA_GPU_AUDIT=1/QA_VECTOR=1, frozen ab1dd3db/5356, контроллер da3d06c3 +6f7b4ea1. Fresh owned page, preflight1700MiB/abort500MiB; если не допускается, остановиться без loops. World points water(400,400), purple(350,400), yellow(450,400), кисть400. Реальные source presets water100/pig0 и water100/pig100, palette записана. Full viewport,512² readback ROI возле world400,400; before/aftereach screenshot, не scoped viewport.

Cumulative explicit readbacks7×512²×4 +1754×2480×4 =24,739,712bytes (<32MiB). Единственный retained baseline1MiB; остальные arrays локальны/освобождаются после каждого шага. Нет full owner-field dump. Общая native Room память НЕ300MiB: previous OFF pre2016/min975; renderer/process/RAM attribution отдельно не измерена. Снимки тоже observer effects и не timing evidence. После raw own close/EXPLICIT RELEASE; Surface scheduling только root, Samsung запрещён.

Получив ON, сначала внутренняя оценка root: side-by-side источник/мокрая зона/смешение/чужая лужа и явные артефакты. При held-positive result приглашать можно только на экспериментальный стенд с оговорённым bounded контуром; полноценная готовность live transport требует gates2–4. Defaults/prod не меняются.

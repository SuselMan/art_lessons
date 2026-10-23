# Следующий причинный тест: время водяного переноса, одинаковый источник

Последние голоса прочитаны из review-votes.json: round51 и round52 better. Smoothdefault против smoothvolume уже дают человеческий выбор профиля H; H16 почти численно эквивалентен, отдельная визуальная пачка для него не нужна.

Один новый эксперимент: **interleaved H pressure против того же числа H шагов после кисти**. Сохранить исходный MAX источник и записанное движение, не менять коэффициент и не создавать ещё одну noise/gain пачку.

## Два matched пути

Оба начинают на пустом полотне, получают фактические монотонные raw MAX P/C префиксы и используют true ΔMAX=P_n−P_(n−1), C_n−C_(n−1). Исходная source tape фиксирована независимо от перемещённого материала. ΣΔ=финальный raw source каждого канала. Coverage одна и та же оригинальная oneshot-маска для всех шагов/моделей; это объявленная diagnostic support convention, не claim текущего engine equivalence.

H для этого отдельного self-overlap теста НЕ old/new binary proxy листа4: источник H — квантованный заранее водяной source proxy из raw MAX P.r, по одному общему scale. Таблица H_n=round(2*rawP_n.r*65535/4); её неотрицательные ΔH_n телескопируются в H_final. P.r содержит water-weighted deposited record, а не измеренный физический объём; это явное ограничение. Все H16 суммы считаются в кодах, без float sum repair. Пик/клиппинг >4 и монотонность — hard guards. Выбор decode2 соответствует source physical22, не подгонке конкретного мазка.

После каждого фактического записанного contact выполнить один и тот же существующий integer brush operator и один дополнительный H-pressure macrostep с общим shared P/C fraction, закрытым originalcovA и позитивным CFL.

A FINAL: brush contacts проходят по порядку; H source Δ прибывает по той же tape, но дополнительные pressure macrosteps откладываются. После последнего brush выполнить N одинаковых шагов.
B INTERLEAVED: после каждого brush выполнить один pressure macrostep. Итого те же N шагов и тот же порядок deterministic pressure ticks. Brush phase ticks отдельны и совпадают по всей tape в двух моделях. Pressure topology/hop schedule фиксирован по своему tick, а не по времени выполнения.

Таким образом меняется только порядок уже определённых brush/H операторов. Более поздние поля закономерно различаются; это не semigroup. ΔP/C/H source tape, число и параметры brush и pressure шагов должны совпадать точно. Pure final dilution проверяется именно A против B, без изменения source dose/geometry или включения будущей краски заранее.

## Первый runnable scope

Использовать готовые `raw-max-prefix-four-capture/raw-prefix-capture.json` (4префикса/15контактов/47дабов, маленькая ROI129×96) и `causal-max-increment-audit/cpu-strong80-systematic-v2.py` как paired brush reference. Новая CPU-ветка копирует reference, не меняет его. H оператор взять из `independent-water-height/cpu-integer-smoothheight-volume-h16-v2.py`, но оставить его step coefficient .1, exact disjoint pairs/common phase. На малойROI hop [1,2,3] циклически с every-intermediate-wet guard; одинаковый фиксированный macrostep в обоих путях. Это иной пространственный horizon, чем успешный4/120×hop6..11, и не претендует повторить полный4.

Малая проверка сначала15контактов, затем максимум4 source groups одного контрольного6/6 и heldout6/5,9/1. Полные исходные ops/дабы сохранены в holdout-inputs/holdout-inputs.json. Для6/6,6/5,9/1 реального per-prefix raw MAX capture сейчас НЕТ: CPU не должен имитировать его Gaussian или нарезать финальный record как будто это источник. Нужен отдельный bounded RAW-only capture по proven full-raw-source-capture/capture-render-v2.mjs: фиксированные4префикса, одно финальное oneshotsource сравнение, отсутствуют carry/diffuse/fullsettle внутри групп. Родитель отдельно разрешает такой GPU capture; настоящая задача его не запускала.

Оригинальные dabs/pressure/angle/t сохраняются; допустима только общая translation в blanktile. Source P/C grouped-final vs oneshot BYTEexact, contacts/fieldB/rect/hash и source monotonicity обязательны. Geometrybounds/captureguard/first8sourceunit≤1s и wholegroup limits наследуются; ни одного90settles сценария.

## Фальсификатор и критерии

* Если A/B почти одинаковы на реальной captured9 tape и6/5,9/1 — отдельный H может быть полезен для entry dilution4, но причинность кисти не является найденным механизмом живых сгущений6/9. Не запускать всё более сильные gain sweeps ради различия.
* Если B создаёт turbine/washboard, hidden pigment или массовые clipping events — отвергнуть перенос/численный schedule, даже если crossing становится светлее.
* Обязательны exactΣ всех8 P/C и Hcode, PB=CA для равных исходных каналов,0..255/H16bounds, sourceaddclipping0 или явный отказ; zero inventory outside originalA0; untouched controls3/7 как CPU no-op, не GPUобещание.
* Сравнить центры/мезоструктуру/силуэт и локальные отношения цвета, не только хеши и carrier darkness. Новый crop не является полной галерейной картинкой. Full-enginefixture integration только после родительского review и matchedfinalRGB.

Никакого production изменения, публикации или GPU запуска этим планом не сделано.

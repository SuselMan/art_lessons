# #728: native settle workload и Samsung timeout

Источник: bounded runner5656188c + reviewde586c95. Read-only audit, без нового
аппаратного запуска и без изменения физики. Samsung UI timeout180с сам по себе
не устанавливает виновный shader или device loss. Root отдельно получил Surface
full1536 grouped100 OFF1118/ON1045мс, exact; поэтому две минуты не являются
универсальной стоимостью этого алгоритма. На Surface end-to-end100 также есть
nonempty результат без GPU/GL ошибок, но native/GL whole-layer пока не exact.

## Конкретный CPU census

`harness/728-native-workload/count.ts` исполняет настоящий generic planner с
контролируемыми CPU metadata/radius50, one1024 tile, принудительным настоящим
field minimum1536. GPU callbacks записываются; это НЕ пиксельный mock proof и
НЕ запись исходной Samsung UI операции. Полный JSON: `temp/native-workload/count.json`.

| Metadata | Front | FieldOp | Diffuse | Brush single | Запущенные cells, только эти семейства |
| --- | ---: | ---: | ---: | ---: | ---: |
| Без brush travel | 171 | 72 | 13 | 0 | 603 979 776 |
| 1 travel | 171 | 72 | 13 | 4 | 613 416 960 |
| 10 travel | 171 | 72 | 13 | 30 | 674 758 656 |

1536² =2 359 296 cells, 192×192=36 864 workgroups по8×8 на full pass.
Таблица исключает clear/copy/absorption/resample/source/presentation и потому
не является полной суммой всей работы. Это число invocation slots, не GPU time,
не число texture transactions и не доказательство количества hardware instructions.
Dry/wet варианты данного metadata дали одинаковые counts; это не общее свойство
всех мокрых штрихов. Маленький видимый штрих НЕ означает маленький settle field.

## Обнаруженная dispatch разница, которую можно исправить exact

`webgpuCanonical/brush.ts` encodeSingle запускает весь1536². В shader проверка
production scissor происходит ПОСЛЕ запуска каждой invocation. То же относится
к fieldOps/resample. В GL WatercolorPasses.brushPass использует gl.scissor до
raster, поэтому fragments вне contact rect не запускаются.

В census одного travel четыре brush dispatch запускают9 437 184 cells ради
48 400 scissor cells (~195× launch overhead). Десять travel:70 778 880 ради424 600
(~167×). Early return не делает полный dispatch бесплатным; стоимость в мс
не установлена. Это **конкретная лишняя работа native adapter**, а не новая модель.

Exact исправление: dispatch ceil(clipped width/8)×ceil(clipped height/8), добавить
integer top-row offset к tid, оставить исходную glPixel/scissor проверку и texture
coordinates неизменными. Ничего не менять снаружи scissor, не очищать destination,
не менять halo и Q8-границы. Shader/scissor rounding надо проверить nonzero Y,
неполными8×8 краями и полностью poisoned outside outputs против нынешней версии.
Это не sparse-front proposal: front/diffuse по-прежнему считают полное поле.

## Почему front может оказаться дорогим именно на Adreno

Native и GL сохраняют тот же unit-step min-plus/front schedule. Native фронт
каждой invocation вычисляет source, paper height и двухчастотный lattice FBM
до проверки доступности8соседей. 171 full passes означают403 439 616 cells.
WGSL paperAt реализует bilerp четырьмя textureLoad + repeat/modulo вручную;
GL texture2D получает фильтрацию fixed-function sampler. Foreign linear sample
в WGSL также четыре textureLoad. Это различие source instructions, не честный
счёт физических memory transactions: hardware GL bilinear тоже читает texели.

Центральный film повторяется внутри8соседей, как baseline GL. Hoist буквально
того же выражения наружу не меняет arithmetic/Q8, но компилятор мог сделать это
сам. Без foreignWet можно специализировать отсутствие foreign sample; нельзя
менять фильтрацию или вводить промежуточный Q8 height/noise cache.

`offset(k,knight)` содержит две локальные arrays и динамический индекс. Uniform
front knight=false теоретически позволяет DCE, но Adreno Vulkan compiler может
иначе развернуть массив/индексацию/регистры, чем GL compiler. Проверяемая гипотеза:
front-specific fixed offsets (тот же порядок8соседей) и literal constant helpers
сравнить с нынешним shader; это НЕ доказанный compiler fallback сейчас.

FieldOps0–20 находятся в одном WGSL pipeline с uniform mode и filter mask.
Внутри mode15/16 есть carry/path/capillary loops, остальных modes — иные ветви.
Большой shader/register pressure может быть device-specific. Compile-time mode
specialization/отдельные entry points сохраняют формулы и Q8, позволяют DCE и
дают измеряемый per-mode gate; не объявлять выигрыш без actual salted warm/hot A/B.

## Проверяемая причинная гипотеза для180с

По приоритету: (1) Adreno-native конкретный kernel/driver path, (2) backlog от UI
presentation/чужих ресурсов, (3) лишний full dispatch контактов. Surface1с
опровергает объяснение «каждый1536 settle неизбежно180с». Наш SwiftShader10мин
не доказывает причину Samsung; это иной backend, в конце CPU contention.

Следующий диагностический запуск root должен иметь original packed operation
и явные counters source stamps/ribbons, fieldOp по mode, front/diffuse/brush,
launched cells против scissor, submit count и outstanding uniform buffers.
Нужны checkpoints source→first front→first diffuse→contacts→finish с bounded
onSubmittedWorkDone deadline, device.lost/error scope и пассивными timestamps.
Не вставлять readback между каждым pass и не принимать timeout за отсутствие
ошибок. Сравнить один и тот же frozen tape в headless UI-free native harness и
видимом UI с wet presentation OFF/ON, владельцы строго последовательно.
Если UI-free тоже зависает, presentation не является достаточным объяснением;
если зависает только UI, изучить его submits/resource lifetime отдельно.

Пока нельзя честно назвать конкретный shader установленным виновником,
«работает быстро на Samsung», whole native/GL parity или production-ready Room.

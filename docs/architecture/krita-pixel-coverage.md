# Krita Pixel: текущая карта реализации

Срез кода: 4 ноября 2026, `agents/brush-import`, `035a3d6bc8de5551dddb6260ec64bd82508ea621`.
Эталон механизмов — Krita `bd6e8d061d2f0388c5b10278786cf0fe62e3135f`.
Цель — ожидаемое функциональное поведение Pixel/defaultpaintops в Grafetto,
запись готовых DRAW и совместное воспроизведение. Побитовая идентичность Krita,
другие движки и эффекты Procreate этой картой не заявлены.

## Что подтверждено

Свежий functional32-каталог содержит 101 Pixel из 118 пресетов и 299 CAS-ресурсов;
в 101 корневой кисти входят 121 граф ролей с дочерними масками. Это количество
пресетов и ролей, а не отдельных движков. Реализация использует общий source author,
canonical renderer, бюджеты и admission, без индивидуальных renderer для пресетов.

- Завершён короткий app sweep **101/101 на настоящем Samsung**, без ошибок;
  собственные контексты закрыты, ожидающих RPC не осталось. Это проверка выбранных
  исходных пресетов, размера и короткого штриха, а не всех комбинаций настроек.
  Повтор на текущем `035a` завершён: 101 PASS, 0 failures, errors пуст.
- Basic и dual прошли длинные **100 MOVE**, реальную подготовку через app hook,
  BEGIN/DRAW/END, отображение второго участника, Saved, Undo/Redo и холодный вход
  обоих участников. На текущем `035a` Basic дал 244 DRAW/203 frames и Saved
  около10.02s, dual — 1433 DRAW/326 frames и около18.30s. Это отдельные наблюдения,
  не изолированный benchmark и не обещание стабильного процента ускорения. Это успешная целостность онлайн-пути,
  но задержка сохранения остаётся задачей производительности.
- Последний целевой GL-блок: **690 тестов /22 файла**, strict **10 production
  roots /300 inputs /0 diagnostics**, lint12 файлов без ошибок. Writer AST-аудит
  253 production inputs:6 raw clearColor/colorMask references, все в owned service.
  Это не общий прогон всех тестов репозитория и не browser-проверка каждого режима.
- Диагностика двух GL clear-state queries: **985→0** повторных запросов на
  выбранной измеренной границе при явном владении состоянием. Это число queries,
  не ускорение всего штриха и не основание пропускать неизвестные GL callbacks.
  Регрессии проверяют исходное состояние, foreign getters/releases и `throw undefined`.
- Для общей композиции отдельно выполнены HOST/Samsung GPU-проверки старого
  набора **26 режимов /170 сценариев**, включая14 независимых literal vectors,
  gray-image и neutral-grain variants. Их результат нельзя переносить на ещё
  не применённые новые режимы.

Нижние browserB GradientMap/Executor проверки, FakeGL-интеграция и server READ
дополняют app sweep. Они подтверждают конкретные ресурсные/исторические границы,
но не заменяют проверку всех настроек, реального физического пера или iPad.

## Карта механизмов в текущем коде

| Механизм | Подключённый путь и границы |
|---|---|
| Default/Gaussian/Soft Auto | Circle/rectangle, fade, ratio, AA, curves, spikes2..64, seeded randomness/density; общий generator/cache/prepass |
| Options/sensors | Pressure/maxPressure, tilt/angle/speed, pen rotation/tangential, time/distance, fuzzy и комбинации; разрешённый functional32 compiler |
| Spacing/scatter/fan/mirror/airbrush | Общий author, checkpoint/RNG order, timed producer и bounded FIFO; perspective плоского canvas явно1 |
| Масштаб | UI size → actual sourceScale → BEGIN/every frame/snapshot/persistence; исходный descriptor не изменяется |
| PNG/GBR/GIH | Исходные alpha/gray/RGB, native dimensions/ranks/selectors, разные rect/размеры кадров; записанные frameIndex/sourceSlot |
| Text/TextPipe | Фактический font backend/provenance, UTF16 sequence и per-frame geometry; точные Qt pixels не заявлены |
| SVG/ABR | Проверенный stock SVG и bounded vector subset; объявленные ABR collections с точным ordinal/name и bounded decoder |
| Gradient Map отпечатка | Gray/alpha → transform → captured tip LUT → sharpness → texture/dual; отдельная sourceTipGradient metadata |
| Material/color options | Softness/LightnessStrength/Sharpness, Mix/Darken/HSV; записанные параметры RGB/RGBA |
| ColorSource | Plain/uniform_random/gradient/total_random/pattern/lockedpattern с явными seed/phase/resource pins; spatial prepass |
| Texture | 14 hard/soft alpha laws, Lightness/Gradient, gray/alpha, phase, AutoInvertOnErase; независимые primary/mask textures |
| Dual/masking | Исходные parent/child и scale, независимые options, общий RNG order; первые10 alpha laws, role fences |
| Внешняя композиция | Over/erase, прежние4 separable режима, browser Color/HSY и22 extended outer blends; WASH и browser-only non-over buildup с явными laws |
| UI/resources/online | Source size, реальный pattern catalogue/selection/readiness, original asset pins, BEGIN/frame/resume/snapshot/recorded attachments |

App sweep покрывает исходные значения101 кисти; таблица не утверждает отдельный
device-сценарий для каждой строки или полного пространства options.

## Композиция и сохранение совместимости

Текущие22 extended outer blends: add, darken, screen, colorBurn, linearBurn,
subtract, difference, exclusion, softLight, hardLight, divide, linearLight,
vividLight, pinLight, hardMix, darkerColor, lighterColor, hue, saturation,
luminosity, hardMixPhotoshop, softLightSvg. Все текущие распознаваемые importer
outer aliases имеют общий реализованный путь; неизвестные исходные операции
отклоняются, а не подменяются Normal.

WASH использует captured law `generic-separable-u8-v1` (header2048), Color/HSY —
свой1024. Non-over buildup использует **browser B** и
`pixel-direct-composite-browser-v1` (4096), исполняет композицию per dab в том же
kernel; masked deposit остаётся OVER до соответствующей границы сегмента.
Старые source/native selectors, material3–7 и hard8 не получают новый допуск
через одно лишь расширение списка названий. Исторический frontier «только7 outer
modes; non-over buildup закрыт» описывал раннюю фазу и **не является текущим**.

## Общие инварианты

CAS задаёт идентичность пикселей, не crop. У каждого image/pattern/texture
consumer свой original-bound rect; общий CAS с разными crop допустим только при
явных pins. Frame index выбирается автором и записывается; replay не пересчитывает
sensors, RNG или resource selection.

GradientMap не заменяется ColorSource/texture Gradient. PREP хранит template без
выдуманной LUT; strict START требует настоящую captured таблицу. Spatial nonPlain
provider использует native inverse-gray alpha precedence; metadata остаётся
immutable. CPU/GPU/program/slot reservations выполняются до pixels и учитываются
без fake credit. Старый idle author compiler может освобождаться только при
доказанном отсутствии активных ссылок; raster/history ресурсы сохраняются.

Ресурсы/материал связаны с BEGIN/gesture/history. Сервер проверяет admission,
исходный descriptor, room authorization и recorded payload, но не рисует.
Canonical JSON сохраняется без потери точности double; не используется epsilon
или восстановление scale из предположений. Read-binding cache ограничен genuine
stream lifetime и полным selector, не обходит проверку каждой строки/кадра.

CPU/GPU/work caps, атомарная отмена,4ms quantum и bounded queues сохранены.
Queued GL commands submit-ятся на границе Coordinator quantum без запроса GPU
completion; owned clear-state mirror инвалидируется на неизвестных callbacks.
Общий GL API сохраняет restore/error semantics, включая `throw undefined`.

## Новый блок и оставшиеся границы

- Дополнительные зарегистрированные native composite aliases вне текущего
  mapping остаются frontier. **10 scalar GenericSC modes + native luminize alias применены после code-first
  блока и проверок: 2196/21 тестов, strict6 roots/40 inputs/0 diagnostics,
  importer29 PASS и 12 сравнений версий; все 655360 пар каналов совпали с
  C++ source-body эталоном.** Семь integer graphs точные, три нелинейных —
  квалифицированный host-libm reference без ARM64/KoLuts идентичности.
  GPU/app проверки новых режимов ещё не выполнены; старые 26/170 результаты
  на этот блок не переносятся. ES1/ES3 source реализован, будущий Samsung
  GPU fixture проверяет WebGL1. Старые профили G/native не расширяются;
  revision38 применяется только к затронутым оригинальным входам.
- SVG остаётся закрытым vector subset; scripts/CSS/external loaders/images/fonts
  не исполняются. Text зависит от фактического font backend и фиксирует substitution.
  Наличие ресурса не означает поддержку всех native SVG/text возможностей.
- Assistants, wrap/document mirror, channel/alpha locks, global app inputs и
  tool overrides — отдельные входы приложения, а не новые Pixel kernels.
  Реальный selected pattern/gradient и hardware sensors нельзя выдавать за
  выдуманный default или заменять browser-догадкой.
- Image side2048/1M pixels, frames256/role, sequence4096 UTF16 units, original
  assets2048 и wire inventory255 остаются admission-ограничениями; нельзя
  обходить их padding, fake CAS или unbounded fallback.
- sRGB/browser arithmetic, AA, Pillow/librsvg и deterministic noise имеют
  функциональные профили. ICC/HDR/native entropy, точная ISA/Qt идентичность и
  **iPad** этим результатом не подтверждены. Физические pen-сенсоры требуют своей
  device-проверки; DOM input sweep не доказывает их hardware-поведение.

Новый импорт использует rendering revision4/compiled2, legacy4 — явный opt-in.
Старые descriptors, material laws и записанные штрихи не переписываются.

## Доказательства и исторический контекст

Рабочие отчёты находятся в `temp/device-runs/krita-stroke-20261024/fixes-v52/`:
`pixel-clear-state-gates-v1/final-proof-v3.json` (690/22, strict10/300/0),
`pixel-read-binding-gates-v1/final-proof.json`,
`pixel10-ui-extended-peer-samsung-readbinding-root1-result.json`,
`pixel-generic-composite-gpu-both-final-proof-v1.json`,
`tip-gradient-executor-browser-both-final-proof-v1.json`,
`pixel-generic-sc-code-layout-readonly-v1.md`.
Каждый запуск имеет собственный source/runtime/input SHA; ранний PASS не
объявляется повторным запуском на новом HEAD. Данные последующих незавершённых
прогонов не суммируются в завершённый результат.

Историческая фаза3 ноября была CODE-FIRST: 743 shared,334 importer/13 skips,
619 production roots и ранние lower GPU/интеграционные сценарии. Тогда обычный
UI/online/undo/cold ещё ожидались, существовал семирежимный frontier. Эти старые
числа и ограничения не описывают нынешний объём; skip без native provider не PASS.
Старый R10/revision3 каталог не заменяет свежий functional32/revision4.

Официальный эталон: https://github.com/KDE/krita/tree/bd6e8d061d2f0388c5b10278786cf0fe62e3135f .
Карта относится только к Pixel/defaultpaintops, не к остальным paint engines.

Новый блок: `pixel-generic-sc10-gates-v1/final-proof-v2.json`,
`pixel-generic-sc-channel-extension-independent-review-v2.json`; точные входы
и результаты отделены от ещё не выполненного device-прогона.

## Последующее расширение, 4 ноября

После среза035a добавлены10scalarGenericSC иalias luminize: 2196/21 тестов,
strict6/40/0, importer29. GPU наe1a1796c7: HOST иSamsung231/231 и
10×65536парPASS; исходные170сценариев сохранены. Детерминированный
arcTangent проверен523/7 и совпал с native hash всех65536пар. Это WebGL1,
а не ES3 GPU или iPad.

31c7714b7 исправляет потерянный browser-профиль в Auto BEGIN:42/3 иstrict1/87/0.
11 настоящих импортов исходных синтетическихKPP прошли ACK/Saved; arc иParallel
прошли peer/Undo/Redo/cold обоих клиентов в повторе. Общий диагностический
PASS отсутствует: один HOST sample превысил2s, ранее непейсированный Parallel
не догналpeer за20s. Производительностьсерий остаётся открытой; задержки
пассивных samples не выдаются за ускорение. Все контексты закрыты, pendingRPC0.

Новый цельный Quadratic9 блок применён после2218/23 тестов, strict6/41/0,
importer31 и11 сравнений revision;589824CPU/nativeU8пар совпали. IDs38..46
append-only, revision39 селективная. Его GPU иapp проверки ещё НЕ выполнены.
Все эти расширения сохраняют закрытыми G/native; другиеpaint engines не заявлены.

Доказательства: pixel-generic-sc-channel-gpu-both-final-proof-v1.json,
pixel10-channel11-app-samsung-31c-root2-root-audit.json,
pixel-dynamic-begin-profile-v1/gates/final-proof-v2.json,
pixel-quadratic9-gates-v1/final-proof.json вfixes-v52.

## После проверки Quadratic

На a30a5f1b9 HOST и Samsung прошли 285 GPU-сценариев и 19 × 65536 пар каналов.
APP9: 9/9 PASS; reflect_freeze и hybrid проверены через peer, Undo/Redo и холодный
вход обоих клиентов. Два lifecycle-сценария выполнялись первыми: это проверка
механизма, а не burst benchmark. Ранее обнаруженный HOST lag остаётся открытым.
Контексты закрыты, pending RPC — 0.

Следующий блок Penumbra/FlatLight/HardMixSofter6 применён после 2232 тестов
в 24 файлах, strict 6/41/0, importer33 и сравнения 393216 пар с native source-body
reference. Четыре integer-графа точные; два atan-графа имеют функциональный
профиль без утверждения ARM64/libm identity. IDs 47..52 добавлены в конец списка;
revision40 применяется селективно. Старые профили G/native не расширены.
На6993e00dd HOST иSamsung прошли321 GPU-сценарий и25×65536пар.
APP6:6/6 PASS; PenumbraD иFlatLight прошли peer/UndoRedo/cold обоих клиентов.
Все контексты закрыты, pendingRPC0; ранее открытый HOST lag остаётся открытым.

Доказательства: pixel-generic-sc-quadratic-gpu-both-final-proof-v1.json,
pixel10-quadratic9-app-samsung-a30-root1-result.json,
pixel-penumbra6-gates-v1/final-proof.json.


## Битовые режимы Pixel

Добавлены десять режимов XOR/OR/AND/NAND/NOR/XNOR/implication/converse
и их отрицаний: IDs53..62, селективная revision41, только browser-профиль.
Цельный блок прошёл2254 теста в25 файлах, strict6/41/0, importer35
и655360 пар независимого DEFINED uint32 wrapping reference.
Это явная функциональная U8-арифметика. В исходном C++ Krita соответствующий
путь зависит от signed overflow; переносимая идентичность native-компиляторам
не заявляется, импорт помечается approximate с указанием закона.
На cabd42c99 HOST иSamsung прошли381 GPU-сценарий и35×65536пар.
APP10:10/10 PASS, implication/converse прошли peer/UndoRedo/cold обоих клиентов;
cleanup чистый, pendingRPC0. Старые G/native-профили закрыты.

Доказательства в fixes-v52: pixel-binary10-gates-v1/final-proof.json,
pixel-generic-sc-binary-extension-independent-review-v1.json,
pixel-generic-sc-penumbra-gpu-both-final-proof-v1.json,
pixel10-penumbra6-app-samsung-699-root2-result.json.


## Полные цветовые семейства HSX

Цельным блоком добавлены HSY5 и HSL/HSV/HSI8 каждый —29 векторных режимов,
IDs63..91, единая селективная revision42. Общая альфа-композиция сохранена.
Покрытие2317 тестов в26 модулях составлено из25 неизменённых модулей V2
и34 тестов исправленного модуля V3; полного повторного V3-прогона не было.
Исправлено только ожидание staged U8-композиции в тесте, production не менялся.
Strict6/41/0, importer37, lint11. Native float witness:3509 векторов,
112 отличий от browser f64, максимум1 байт; это диагностическое сравнение,
не заявление native pixel identity. GPU иAPP29 пока не выполнены.

Доказательства в fixes-v52: pixel-hsx29-gates-v3/final-proof.json,
pixel-generic-sc-hsx-extension-independent-review-v2.json,
pixel-generic-sc-binary-gpu-both-final-proof-v1.json,
pixel10-binary10-app-samsung-cabd-root1-result.json.


## Численный граф HSX и следующий Scalar23

Первоначальный GPU-прогон7cf:555 обычных сценариев и35 scalar-таблиц прошли,
RGB29 — FAIL. HOST120 иSamsung119 каналов отличались отCPU f64 на1;
междуGPU совпали28/29 полныхRGBA-таблиц. Эти FAIL сохранены.
HSX29 переведён на фиксированную сетку65535 с точными парными целочисленными
произведениями/остатками наGPU. Входbyte*257 сохраняет тёмные цвета.
Старые0..62, общая альфа-композиция, wire и профили не изменены.

Одновременно добавлен цельный Scalar23, IDs92..114/revision43:14 световых
режимов,6 modulo, HardOverlay и2 interpolation. Для пяти real-epsilon
modulo выбран явный browser rational-U8 закон; это approximate импорт
с token defined-rational-u8-modulo-v1, а не native double-epsilon identity.

Объединённый14-file блок проверен2350 тестами в28 модулях, strict6/41/0,
lint12 (два предупреждения о точности исходных PNorm литералов), importer39.
Scalar23:23×65536 CPU/reference пар и векторы совпали на этомhost;
2 integer и6 defined строгие,15 libm-qualified. Повторный HSXfloat/Q witness
под combined:129 отличий/3509, максимум1. Это не native pixel identity.
GPU f975 на HOST иSamsung:693 обычных сценария,35 прежних полных
scalar-таблиц и29 HSX RGB-таблиц прошли. В новых23 scalar-таблицах
9 режимов имеют численные расхождения;8 таблиц отличаются междуGPU.
FAIL сохранены, выполняется коррекция pow/cos. APP расширений ещё не выполнен.

Доказательства в fixes-v52: pixel-combined-scalar-q-gates-v1/final-proof.json,
pixel-hsx29-first-host-root-audit.json,
pixel-hsx29-samsung-host-diagnostic-root-audit.json.


## Normal Map и Lighting

Добавлены IDs115..118/revision44: Lambert Lighting, Lambert Lighting Gamma2.2,
Combine Normal и Tangent Normalmap. Используется RGB-граф и существующая
альфа-композиция; scalar API явно отклоняет эти режимы с RangeError.
Фиксированная сетка65535, парные произведения, исправленный integer sqrt;
новых GPU ресурсов и wire полей нет. Только браузерный профиль B.

Независимый статический разбор завершён без блокеров. Цельный блок прошёл
2360 тестов/29 модулей, strict6/41/0, importer41 и независимые BigInt RGB
проверки. Все13 применённых файлов совпали с проверенными SHA.
GPU/APP Normal4 ещё не проверены; native pixel identity не заявляется.

Доказательства: pixel-normal4-gates-v3/final-proof.json,
pixel-normal4-gates-v3/actual-applied-equivalence-proof.json,
pixel-normal4-extension-independent-review-v3.json.


## Шесть собственных RGBA-композиций

IDs119..124/revision45: Copy Red/Green/Blue, Behind, SAI Luminosity, Greater.
Собственные альфа-оболочки выполняются до generic-SC shortcuts. Копирование
каналов сохраняет destination alpha; SAI прибавляет цвет напрямую, без общего
unpremultiply. Greater использует детерминированные Q65535 sigmoid weights.
Исторический colorHsy сохранён отдельной веткой. Только профиль B.

Вместе применён точечный Easy Dodge endpoint: S255 сначала даёт255, затем D0
даёт0; GPU pow не вызывается на этом нулевом основании. Прочие Scalar23
численные расхождения этим не объявляются исправленными.

2375 тестов/31 модуль составного покрытия:29 неизменённых модулей2231 плюс
144 проверки двух исправленных исторических модулей; полный V2 rerun не
проводился. Первоначальные5 FAIL сохранены, исправлены только неверная область
общего alpha-endpoint теста и граница извлечения HSX shader блока. Все прежние
14 выходов блока совпадают побайтно; дополнительно изменены2 test файла.
Strict6/41/0, importer43. Все16 применённых файлов совпали с проверенными SHA.
GPU/APP Custom6 и нового endpoint ещё не запускались.

Доказательства: pixel-custom6-endpoint-gates-v2/final-proof.json,
pixel-custom6-endpoint-gates-v2/actual-applied-equivalence-proof.json,
pixel-custom6-endpoint-combined-independent-review-v1.json.


## Четыре детерминированных численных графа Scalar23

PNormB использует математический floor fourth-root через два исправленных
целочисленных sqrt. Tint IFS — Q65535 sqrt/product; Interpolation и2x —
замороженные Q65535 cos-коэффициенты, вычисленные через Machin/Taylor с
аналитической обработкой точных половин. Interpolation2x сохраняет внутренний
байт перед вторым преобразованием. Никаких новых texture/uniform ресурсов.
Только эти4 unshipped revision43 получают defined-scalar23-root-cos-q65535-v1.

2381 тест/32 модуля PASS, включая262144 пары независимого BigInt reference;
strict3/10/0, importer44. Все6 применённых файлов совпали с проверенными SHA.
Повторный native23 диагностический прогон:20 hash совпали, Tint/Interpolation/2x
изменились согласно явно новому численному закону; native byte identity
не заявляется. PNormB на этомhost совпал с native witness.
GPU/APP нового графа ещё не запускались. Остальные5 pow-режимов дорабатываются.

Доказательства: pixel-scalar4-root-cos-gates-v2/final-proof.json,
pixel-scalar4-root-cos-gates-v2/actual-applied-equivalence-proof.json,
pixel-scalar4-rebase-and-scalar5-generator-independent-review-v1.json.


## Финальные шесть RGBA-механизмов

IDs125..130/revision46: Copy, Destination In/Atop, Raw Alpha Darken, Marker,
Dissolve. Собственные оболочки выполняются до общих zero-alpha shortcuts.
Destructive WASH сохраняет native64 область независимо от физических тайлов,
с версионными неизменяемыми срезами области. Raw Alpha Darken учитывает flow
и averageOpacity; Marker использует creamy. Dissolve использует стабильный
seed жеста и общий целочисленный world-coordinate hash, не native entropy.
Только профиль B. Masked final6 buildup пока закрыт явно.

Составное покрытие2602/37: первоначальный прогон2595PASS/7FAIL сохранён;
исправленные фикстуры проверены отдельным прогоном312/6. Это не полный
повторный запуск37 модулей. Strict22 roots/333 inputs/0: production shared
NodeNext, web bundler и отдельный shared Vitest test bundler; не утверждается
полный shared tsc. Importer18 PASS, lint exit0 с сохранёнными предупреждениями.
Все24 применённых файла совпали с проверенными SHA. GPU/APP/онлайн ещё не
запускались для этого блока.

Доказательства: pixel-final6-gates-v3/final-proof.json,
pixel-final6-gates-v3/actual-applied-equivalence-proof.json,
pixel-final6-extension-independent-review-v5.json.


## Пять табличных режимов Scalar23

Easy Dodge/Burn, PNormA, Super Light и Soft Light IFS используют общий
канонический закон defined-scalar23-power-u8-v1. Пять статических таблиц
занимают320 КиБ; выбранная страница64 КиБ загружается и проверяется до BEGIN.
CPU и GPU используют те же байты. Страница имеет явные CPU/GPU reservations,
Work/Entry/author leases и сохраняется при восстановлении нескольких режимов.
Обычные кисти не получают таблицу или пятый sampler. Сетевых полей не добавлено.

Составное покрытие2431/40: wholeV3 2430PASS/1mockFAIL, затем16/4 PASS после
исправления TEXTURE1 в mock; не полный повтор final-map. Strict24/341/0,
importer47 PASS, lint0 errors/13 existing warnings. Все33 применённых файла
совпали с проверенными SHA. GPU/APP ещё не проверены.

Доказательства: pixel-scalar5-atlas-gates-v6/final-proof.json,
pixel-scalar5-atlas-gates-v6/actual-applied-equivalence-proof.json,
pixel-scalar5-atlas-combined-independent-review-v5.json.

Уточнение masked Final6: pinned Pixel UI принудительно сохраняет WASH при
включённой маске (effective mode → baked data → PaintOpAction=2). Runtime
требует indirect mode. Raw Buildup+mask противоречит нативному предусловию;
его явный отказ не означает отсутствующий selectable Pixel-механизм.
Доказательство: pixel-masked-final6-native-ui-independent-v2.json.

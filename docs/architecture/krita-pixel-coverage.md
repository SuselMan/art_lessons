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

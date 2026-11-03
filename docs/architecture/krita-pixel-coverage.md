# Krita Pixel: текущая карта реализации

Срез кода: 3 ноября 2026, ветка `agents/brush-import`. Эталон механизмов —
Krita `bd6e8d061d2f0388c5b10278786cf0fe62e3135f`. Цель — функциональное поведение
Pixel/defaultpaintops в клиентском Grafetto; побитовая идентичность не требуется.
Другие движки Krita и эффекты Procreate не входят в эту итерацию.

## Что означает состояние

«Код подключён» означает наличие importer/source binding, author, ресурсов,
записанного исполнения и необходимых границ admission в рабочем дереве.
Это **не результат запуска** и не количество поддержанных пресетов. Последний
аудит исходного набора выделил 101 Pixel из 118 пресетов; это классификация
входа, не 101 успешная проверка. Исторические 27 проверенных кистей этим кодом
не переоценены. Старый QA R10 не содержит новую реализацию.

## Карта механизмов

| Механизм | Подключённый код | Практическая проверка |
|---|---|---|
| Default/Gaussian/Soft Auto | Circle/rectangle, fade, ratio, AA, Soft curve, spikes2..64, seeded randomness/density, общий geometry/cache/prepass | Предстоит |
| Динамические options/sensors | Общий compiler/query: pressure/maxPressure, tilt, angle, speed, pen rotation/tangential, time/distance, fuzzy, комбинации кривых | Предстоит |
| Spacing/scatter/fan/mirror | Общий author и checkpoint/RNG order; source/world rotation и ограниченные очереди | Предстоит |
| Airbrush | Timed producer, Rate/ignoreDistance, тот же author/FIFO | Предстоит |
| Масштаб | Выбор размера, исходный scale, START/BEGIN/frame и coverageScaleFactor; bounded capacity | Предстоит |
| PNG/GBR | Исходные прямоугольники, integer levels/LOD, ratio/mirror/rotation, original image capture | Предстоит |
| RGB/Lightness | Парные alpha/gray/RGB, собственные кадры/rect, преобразование и правильный foreground режим | Предстоит |
| Gradient Map отпечатка | Gray/alpha → transform → захваченный tip LUT → sharpness → texture/dual; sourceTipGradient в истории | 8 нижних GPU-сценариев прошли на HOST и Samsung; интеграционные границы проверены отдельно, обычный UI ещё предстоит |
| GIH | Native dimensions/ranks/selectors/EOF, разные размеры кадров, записанные index/slot; родительский scale не подменяется размером child | Предстоит |
| Static Text/TextPipe | Фактический шрифт и provenance, UTF16 sequence, уникальные glyph masks и per-frame geometry; native Qt pixels не заявлены | Предстоит |
| SVG | Проверенный stock SVG и отдельный ограниченный vector subset; offline subprocess, исходные SHA и фактические версии renderer | Предстоит |
| ABR как ресурс Krita | Только объявленная коллекция, native ordinal/точное legacy имя; существующий bounded ABR decoder, без PNG fallback | Предстоит |
| Softness/LightnessStrength/Sharpness | Общие compiled material options и записанные параметры; sharpness после фактической материализации alpha | Предстоит |
| Цветовые options | Mix/Darken/HSV через общий author; recorded RGB/RGBA | Предстоит |
| ColorSource | Plain/uniform_random/gradient/total_random/pattern/lockedpattern; явные seed/phase/resource pins и spatial prepass | Предстоит |
| Текстуры | 14 hard/soft alpha laws, Lightness/Gradient, gray/alpha, phase, AutoInvertOnErase, отдельные primary/mask textures | Предстоит |
| Dual/masking | Исходные parent/child данные и размеры, независимые options, общий порядок RNG, первые10 допустимых alpha laws и fences | Предстоит |
| Внешняя композиция | Over/erase/multiply/lighten/colorDodge/overlay и отдельный functional browser Color/HSY | Предстоит; другие modes закрыты |
| UI и ресурсы | Source size, pattern catalogue/выбор/готовность; оригинальные asset pins сохраняются в комнате | Предстоит |
| Онлайн/история | Author вычисляет DRAW; replay не повторяет sensors/RNG. BEGIN/frame/resume/persistence/snapshot/recorded attachments расширены для новых данных | Предстоит |

## Общие инварианты

Один source author и один canonical renderer, без пресетных исключений. CAS —
идентичность пикселей, а не область чтения. У каждого image/pattern/texture
consumer своя исходная область; одинаковый CAS с разными crop допускается
только при явных original-bound pins. Legacy unbound-пути сохраняют строгую
проверку. Индекс кадра выбирается автором и записывается; replay его не выбирает.

Gradient Map не заменяется ColorSource/texture Gradient. PREP хранит template
без выдуманной LUT; только START с настоящей captured таблицей создаёт реальный
материал. При native nonPlain spatial provider используются inverse-gray alpha
и цвет поля, затем sharpness; таблица остаётся в immutable metadata. Программа,
LUT и дополнительные slots резервируются только по потребности до pixels.

Структура даба не содержит шрифты или LUT. Ресурсы и material metadata связаны
с BEGIN/gesture/history; сервер ретранслирует и проверяет, но не рисует. Бюджеты
CPU/GPU/work, room authorization и атомарная отмена подготовки сохраняются.

## Явные границы

- Общий compositor вне семи перечисленных outer modes пока закрыт, как и
  non-over/non-erase buildup. Screen/burn/add/HSL и прочие не подменяются normal.
- Application assistants, wrap/document mirror, channel/alpha locks и tool
  overrides — отдельные входы приложения, а не ещё один Pixel mask kernel.
- Image side2048/1M pixels, frames256/role, sequence4096 UTF16 units,
  исходные assets2048, wire inventory255 и остальные budgets — ограничения
  admission. Нельзя обходить их padding, fake CAS или неограниченным fallback.
- SVG поддерживает закрытый subset; сложные scripts/CSS/external resources
  не исполняются. Text требует фактического font backend и сохраняет substitution.
- sRGB/браузерная арифметика, AA, Pillow/librsvg и deterministic noise — явные
  функциональные профили. ICC/HDR/native entropy и точные Qt edges не обещаются.
- Новый импорт имеет rendering revision4. Старые descriptor/recorded revisions,
  коэффициенты3/4 и законы material3–7 не переписываются. Новый импорт по умолчанию
  использует общий compiled2, legacy4 — только явный opt-in.

## Проверки на конец фазы кода

Локальные checkpoints `6a3c6aa9b` и `1f3226dbf`; следующий блок Gradient Map/ABR
ещё фиксируется. Shared compile27: 70 production roots/0 diagnostics; server
compile24: 68/0. Frontend compile21: 619/0 на том же кодовом блоке. Девять Python-файлов проверены через compile() без импортов/декодирования.

В этой фазе не запускались тесты, приложение, браузеры, импорт кистей, Krita
или планшеты. Следующая фаза — исправлять реальные ошибки запусков, проверить
ресурсную/историческую целостность и ожидаемые штрихи, затем отзывчивость и память.
Наличие кода и успешная компиляция ещё не дают оснований объявить полную поддержку.

## Источники и рабочие отчёты

### Фаза запусков, 3 ноября

На `54a939581` исправлены реальные ошибки копирования старого V2 budget,
допуска прежнего seeded-density профиля, проверки foreign receiver и повторных
ключей ресурсов. Для нового Pixel исправлены исходные crop в PREP, передача
alpha-only PREP-контекста, сравнение BEGIN с настоящим START и допуск Gradient
Map в adapter/resource preparation. Vitest теперь использует shared/src этой
рабочей копии вместо устаревшего shared/dist.

- Shared: 743 теста прошли (`pixel-functional-all-shared.log`). Importer: 334 теста, 13 пропущены без явного
  внешнего native compiler. Эти skip не означают успешную native integration.
- Клиент после интеграционных исправлений: 619 production roots, 0 диагностик.
- Нижний Executor2/8 на `7ffcc12a330a`: 8 случаев на HOST SwiftShader и Samsung
  Adreno650, одинаковые итоговые RGBA и независимый CPU-оракул. Покрыты Gradient
  Map, spatial bypass, texture8, masking, поворот/зеркало, Sharpness и отмена
  после ошибки callback. Ресурсы освобождены, прежние вкладки сохранены.
- Новый FakeGL-сценарий редактора: 3/3 — START/BEGIN, recorded frames/replay,
  отмена реального resource ticket и разные crop при общем CAS.
- Новый серверный сценарий: 2/2 — захваченная LUT и spatial metadata через
  Transport/resolver, сохранённую строку Prisma stub и cold READ. Это не real DB.

Общий ранний engine/server прогон дал 3683/3687 после исправлений: два новых
серверных случая затем исправлены и прошли отдельно; два исторических CPU-теста
достигли 5s под одновременной GPU-нагрузкой; без неё весь их модуль прошёл 21/21
при прежнем лимите 5s. Общий текущий
прогон ещё не объявлен зелёным. Новые механизмы не проверены обычным UI и пером,
онлайн-комнатой, Undo/Redo и холодным входом на обновлённом стенде. Каталог R10
от старого importer revision3 не является проверкой нового импорта revision4.

Официальные исходники: https://github.com/KDE/krita/tree/bd6e8d061d2f0388c5b10278786cf0fe62e3135f
— `KisDabCacheUtils`, `kis_brush.cpp`, `KisColorfulBrush`, mask generators,
masking/texture composite factories, `kis_text_brush` и ABR collection.
Формулы реализованы в общем клиентском пути; исходный код GPL не переносится
целиком как зависимость.

Статические отчёты и компиляции: `temp/device-runs/krita-stroke-20261024/fixes-v52/`:
`pixel-finite-residual-mechanisms-readonly.md`,
`pixel-raster-remaining-mechanisms-readonly-v1.md`,
`pixel-frontend-closure-static-audit-v1.md`, `ROOT-CODE-FIRST-CURRENT.json`.
Protected `sourceDefaultAutoVectorShader.ts` не читается и не участвует в проверках.

### Полный свежий каталог и functional-профиль

Свежий импорт содержит 101 Pixel из 118 пресетов и 299 CAS-ресурсов.
Первый полный аудит проверяет все 121 графа ролей, включая 20 дочерних масок,
а не только корневые кисти. Обнаруженная 22-узловая кривая маски
Round-Grunge теперь также скомпилирована. Отдельный source-functional provider расширен до 32 узлов
с прежними общими бюджетами; native mapped v3 остаётся ограничен старой
грамматикой. Provider имеет собственный build ID, тестируется независимым
расчётом сплайна и не заявляет ISA/пиксельную идентичность.

Актуальная серия server+curve: 76 проверок прошли. Новый browserB-путь требует
своего допуска и профиля на каждой стадии; его нельзя подтверждать прежними
нижними GPU-проверками G. Найденные потери оригинальных metadata в texture/dual
и фиксированные профили в index исправлены. Свежий B-аудит дал
101/101 admission, binding, compiled program и настоящий SourceStrokeAuthor
constructor без отказов (`pixel-functional-browser101-result.json`). Это
проверка готовности программ, а не выполненных штрихов или GPU. Полный UI/real DB/онлайн/холодное восстановление и плавность нового
набора остаются обязательными до заявления готовности.

Нижний browserB-проход теперь проверен отдельно: 8/8 сценариев на HOST и
Samsung Adreno650 совпали с независимым CPU-оракулом и друг с другом.
Это endpoint OVER на прозрачной цели, не общая проверка всех смешиваний.
Proof: `tip-gradient-executor-browser-both-final-proof-v1.json`; контексты
закрыты, CPU/GPU-учёт обнулён, временный bundle удалён. Полный importer:
343 теста прошли, 13 legacy-native проверок пропущены без отдельного provider.
Новый functional32 provider был передан явно и его проверки выполнены.

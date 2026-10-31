# Начало нативного свободного штриха

`sourceStrokeStartup.native.json` фиксирует реальный Samsung SM-T970 / Krita
5.3.4.1, Airbrush Soft (индекс 3), исходный генератор диаметра 600, масштаб 1,
ресурсная непрозрачность 1, давление 1 и отдельный действительный штрих
`.25 → .5 → 1 → .25`, чёрный цвет, wash/creamy/over. Это узкий профиль
`krita-freehand-no-smoothing-v1`, а не утверждение о совместимости всех кистей.
Исторические программы с отсутствующим `inputProfile` по-прежнему задают явный
первый `paintAt` и используют прежние фикстуры.

Причина различия — `KisToolFreehandHelper::initPaint`: без airbrush первоначальный
`paintAt` отложен. Начальный `KisSpacingInformation` имеет spacing 0, а
`KisDistanceInformation` ограничивает его снизу значением 0.5. Поэтому первый
отпечаток движущегося штриха расположен на расстоянии 0.5 от DOWN. `endPaint`
рисует последнее сохранённое paint information, если paint dispatch ещё не
было. Важная граница: helper `paintLine` выставляет `hasPaintAtLeastOnce` до
исполнения distance iterator, даже если тот не выдал ни одного отпечатка.
Поэтому DOWN без MOVE получает завершающий отпечаток, а принятый нулевой MOVE
или движение меньше 0.5 не получает его. Это исходный dispatch закон, а не
проверка фактического числа созданных масок.
Для airbrush исходный немедленный `paintAt` сохранён. Два paintop role для нового
профиля пока отклоняются: их общий startup dispatch отдельно не подтверждён.

Входы — фактические Android MotionEvent: deviceId 6, source `0x5002`, stylus tool 2,
одинаковый downTime, монотонные eventTime, WAIT_FOR_FINISH. В фикстуре сохранены
сырые binary32 биты X/Y, время и давление. UP не поступает в `plan` как новая
точка с нулевым давлением. Клиент выполняет `adapter.beginInput(state)`, полностью
читает `author.finish(state)`, затем вызывает `adapter.finish(state)`. Завершение
является отдельным структурным сегментом с `inputComplete`; его checkpoint
можно возобновить обычным `resume`. Профиль и ended входят в проверку checkpoint.

Координатное преобразование получено до сравнения PNG из независимой векторной
полилинии того же собственного документа 512×512 при zoom 100%, rotation 0,
300 dpi: физические X/Y преобразуются добавлением −924.75/−659.75. Все стратегии
snapping были выключены. Отдельный контроль `fraction56` подтвердил сохранение
дробного binary32 входа: первая точка SVG имеет нулевую ошибку; последующие
относительные координаты ограничены десятичной точностью сериализации SVG.
Позиции не искались по изображению.

Независимый source oracle использует сохранённые методы оригинального
`KisDistanceInformation` pinned bd6e8d06, source loop `KisPaintOpUtils::paintLine`
и минимальные Qt shims. Сборка: существующий g++, `-std=c++17 -O2
-ffp-contract=off`, x86 VPS. Это **source-based oracle, не исполнение ARM
paintLine**. Исходники Krita сохраняют свои SPDX GPL notices; здесь сохранены
входы, результаты и атрибуция, без копирования библиотек.

Результаты действительного GUI, отдельного source oracle и production автора:

| Проверка | Точки без UP | Отпечатки | Старый immediate профиль, неверные alpha | Новый профиль, неверные RGBA |
|---|---:|---:|---:|---:|
| `single54`, tap | 1 | 1 | 0 | 0 |
| `prefix55` | 20 | 2 | 68271, max 3 | 0 |
| `mapping53`, весь штрих | 126 | 9 | 95931, max 4 | 0 |
| `pressure57`, переменное давление | 121 | 9 | Не проверялся | 0 |

`pressure57` содержит 122 действительных Android события за 2046 ms; DOWN и
120 MOVE имеют фактические binary32 биты давления, UP имеет давление 0 и не
планируется как точка. Опорные индексы 0/40/80/120 дают `.25/.5/1/.25`.
Новый автор и тот же адаптер/кодировщик создают 198 кадров и девять отпечатков.
Давление проходит через настоящую сохранённую нелинейную Opacity curve кисти;
первый opacity равен `0.09316679835319519`, последний —
`0.23457030951976776`, последний averageOpacity — `0.8895552754402161`.

Композиция теста теперь выводится из подтверждённых данных: mode/outerBlend
через `canonicalSourceComposition` исходного дескриптора (`PaintOpAction=2`,
indirectPainting=true), global AlphaDarken через сохранённое отсутствие ключа
`useCreamyAlphaDarken` и pinned reader default=true/BgrU8 factory, ресурсная
непрозрачность — из снятого UI100%. В `nativeControls` записаны SHA настроек,
reader и runtime KPP. Полный kritarc оставался только в RAM, сохранены лишь два
разрешённых ключа; `tabletPressureCurve` также отсутствует. На реальном Samsung
pinned reader использует линейную глобальную кривую (1025 F32 samples), без
Xiaomi override. Исходный `disable_pressure` QAction при старте checked=true
означает включённое давление, несмотря на обратное имя переменной. Сама кисть
не менялась: экспорт после штриха из того же процесса дал все 114 stock params.
Предыдущие проверки с давлением 1 сами по себе не различают creamy/hard.
Для динамического случая fixture не выдаёт позиции production автора за
независимый native placement oracle: независимым остаётся SHA полного GUI PNG.

Тест заново выполняет **тот же** SourceStrokeAuthor → MaterialAdapter →
CanonicalFrameEncoder → PrimaryComposition, строит маски существующим soft
kernel и считает существующий fused32 creamy composition. SHA всех 1 048 576
финальных RGBA-байтов совпадает с независимым native GUI PNG для каждого случая.
Повтор с structured-clone/resume после каждого yield даёт идентичные события,
состояния RNG и encoded frames. Это CPU проверка нового входного профиля;
нового GPU/UI admission этим коммитом не предоставляется. После pressure57
собственные KRA/KPP/helper удалены после сравнения байтов, диагностический preset
удалён через GUI, исходные stock600/All/Basic/Snap и rotation free/1/0
восстановлены; Krita закрыта, disposable helper строго удалён. Receipt:
`pressure57-lifecycle.json` с `cleanupComplete=true`.

Полные компактные receipts: `temp/device-runs/krita-stroke-20261024/fixes-v52/`
`native-gui-stroke52/native-freehand-startup-rootcause-proof.json` и
`{prefix55,mapping53}-native-distance-source-oracle.json` (SHA исходников, входов,
генератора и бинарника). В том же каталоге `build-prefix55-distance-witness.py`
воспроизводит source oracle с аргументом `prefix55` или `mapping53`; сборка
размещается только в зарегистрированном disposable каталоге. Own native
документы/помощники на Samsung удалены после проверки байтов; Krita закрыта,
исходные настройки восстановлены. Оба расходных каталога g++ удалены через
strict qa-cleanup. Пользовательские документы и Chrome tabs сохранены.

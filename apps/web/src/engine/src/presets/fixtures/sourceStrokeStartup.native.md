# Начало нативного свободного штриха

`sourceStrokeStartup.native.json` фиксирует реальный Samsung SM-T970 / Krita
5.3.4.1, Airbrush Soft (индекс 3), исходный генератор диаметра 600, масштаб 1,
непрозрачность и давление 1, чёрный цвет, wash/creamy/over. Это узкий профиль
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

Тест заново выполняет **тот же** SourceStrokeAuthor → MaterialAdapter →
CanonicalFrameEncoder → PrimaryComposition, строит маски существующим soft
kernel и считает существующий fused32 creamy composition. SHA всех 1 048 576
финальных RGBA-байтов совпадает с независимым native GUI PNG для каждого случая.
Повтор с structured-clone/resume после каждого yield даёт идентичные события,
состояния RNG и encoded frames. Это CPU проверка нового входного профиля;
нового GPU/UI admission этим коммитом не предоставляется.

Полные компактные receipts: `temp/device-runs/krita-stroke-20261024/fixes-v52/`
`native-gui-stroke52/native-freehand-startup-rootcause-proof.json` и
`{prefix55,mapping53}-native-distance-source-oracle.json` (SHA исходников, входов,
генератора и бинарника). В том же каталоге `build-prefix55-distance-witness.py`
воспроизводит source oracle с аргументом `prefix55` или `mapping53`; сборка
размещается только в зарегистрированном disposable каталоге. Own native
документы/помощники на Samsung удалены после проверки байтов; Krita закрыта,
исходные настройки восстановлены. Оба расходных каталога g++ удалены через
strict qa-cleanup. Пользовательские документы и Chrome tabs сохранены.

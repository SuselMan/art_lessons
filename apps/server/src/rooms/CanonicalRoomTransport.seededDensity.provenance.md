# Явная серверная политика seeded default-auto

Узкий серверный opt-in; по умолчанию выключен. Старый `Exclude` в
`CanonicalDefaultAutoExecutionPolicy`, `autoSources` и startup policy не расширены.
Shared, frontend, Room, UI и действующий QA runtime не изменяются.

## Контракт и полномочия

Новые отдельные поля `seededDefaultAuto` и
`recordedSeededDefaultAutoProfile` копируются/замораживаются. Author требует
recorded D, явный GenericSC и mixed-v2. Recorded-only разрешает восстановление
исходного материала, но не BEGIN/resume/live writer. Только исходный defaultAuto
с density<1 проходит новую ветку; density1 остаётся старым coverage2. Материал
проверяет существующий shared binding, включая mapped compiler closure, исходный
SHA, source и эффекты. Нет выбора по wire definitions, попыток разных decoder,
переименования V1 или серверного RNG.

BEGIN и cold чтение используют одинаковый pin исходного descriptor. Resume
существующей pinned gesture проверяет разрешение D по сохранённому material,
не по изменившемуся operator catalog. Cold читает только durable room catalog.
Отключение D после записи закрывает чтение, вместо подмены coverage. Source
pressure/tilt не предоставляют UI eligibility. Seed consumer уже отдельно хранит
исходный strokeId; room/user/readEpoch остаются полномочиями, не seed.

## Проверки

Нормальный реальный Marker из
`sourceDefaultAutoWholePath/markerDry.normal.native.json` (consumer f6613fc9e),
canonical descriptor SHA
`7fd13ac324a458b265a19fb696fe4c91820fa5a9512a29ae24a66c064799d5b5`.
Проверен actual source author → adapter → encoder (envelope2/coverage4),
принудительный штатный flush даёт пустой первый control frame до draw.

Focused: 34 теста / 3 файла PASS. Новые проверки включают strict policy/accessor/
symbol/inherited rejection, author⊆recorded, исходный Marker SHA, непустые draw,
нулевой начальный control frame, live/record/dedupe, отказ DB и retry того же ID,
recorded-only prefix, cold resume, неизменный cached native/D pin при удалении
каталога, отказ density1 через D-only, OFF отказ и stale read.
Actual mixed-V2 history Basic2 density1/native + Marker .8/D проходит существующий
paged DB loader, whole-prefix verification и attachment preparation без relabel.
Тесты используют mock DB; это не проверка реального сервера/сокета/GPU/планшета.

Server SOURCE noEmit PASS. Старые native/browser/soft/image/admission regressions:
114 тестов / 5 файлов PASS. Логи R52 `seeded-server-tsc-final.log` и
`seeded-server-regression.log`. Scoped oxlint: 0 errors, прежний
`no-this-alias` warning в неизменённом участке transport. `git diff --check` PASS.
Первый RED policy test подтвердил отсутствие нового freezer; подготовительные
fixture/type ошибки исправлены без ослабления production validators.

Ресурсы: зависимости, сервисы, браузеры, устройства, disposable runtimes не
создавались. Shared/dist не собирался. Policy не включена, commit ожидает review.

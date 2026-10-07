# Диагностика независимого обмена на нулевой стоимости (#728)

Кандидат выключен по умолчанию: `WatercolorSettlePlan.diagnosticIndependentZeroFaces=false`.
Это численный эксперимент, не доказанное исправление видимой каёмки. GPU ещё не проверен.
Основа 580713e9; route-independent cost eligibility из52fe10ea перенесена отдельно
коммитом38133191 без промежуточной документации.

## Сохраняемый контракт

Исходные строки carry shaders не изменены. ON лениво создаёт отдельные программы
15/16; OFF не создаёт дополнительных программ. Положительные веса, их исходный
нормализатор (включая веса нулевых граней), limiter и порядок carry сохранены.
Связный cost-domain guard применяется как раньше; флаг не меняет его eligibility.

Меняется только взаимный поток между четырьмя соседями с нулевой стоимостью,
нулевым градиентом с исходным допуском и положительным V на всём пути. Новый
коэффициент φ/4, где φ — существующий phase gate по минимальному V пути.
Зеркальный поток через положительные грани не добавляется.

Для donor legacy суммарный выход ≤ rate·travel·P.a, поскольку legacy Σ
содержит все неотрицательные веса. Для четырёх новых граней сумма φ/4 ≤1,
выход также ≤rate·travel·P.a. Консервативный общий bound ≤2·rate·travel.
При текущих rate=.5 и travel=.35 он равен .35. Каждый поток вычитает одну
и ту же долю donor из всех переносимых P/C каналов и добавляет её соседу.
Отсюда положительность, сохранение массы и постоянного отношения цвета
для непрерывной арифметики ДО FIELD_FIT и RGBA8 округления.

P — существующий mobile inkLoad: r/g исторические water/wet tags, b сила
пигмента, a carrier dose; C.rgb optical depth, C.a pigment mass. Геометрический
coverage находится в отдельном буфере и не меняется. V/cost неизменны.
Новый оператор сохраняет существующую семантику переноса всего mobile P,
не подменяет фактический объём воды историческими P.r/g.

## Проверки и ограничения

CPU oracle содержит буквальную независимую gather-референцию старого shader;
сравнение со старым face oracle включает original zero-inclusive Σ. Проверены
смешанные positive/zero соседства, dry/gap/phase/stride guards, mass и цвет
за100 шагов, maximum principle ТОЛЬКО нулевого plateau, positive-only exact.
Глобальный maximum principle positive legacy не заявляется.

Программы проверены на OFF/no-allocation, ON/lazy reuse P/C, освобождение на
 destroy и forget invalid handles при restore. Это проверки lifecycle в MockGL,
не компиляция настоящим Adreno. Plan capture фиксирует флаг при prepare;
переключение позднее не меняет уже подготовленную работу. Сохранён route guard
на historical и owned paths, pure-water/mixed/abort/loss controls.

Предыдущие числа59/81 из сокращённого independent CPU oracle не используются:
тот oracle изменял positive Σ. Сохранённый реальный ROI не является полным
полем; неизмеренные входы за его пределами не позволяют заявить GPU parity.
Нужны immutable full-field hardware OFF/ON P/C/V/cost, actual ring profile,
масса с отдельным учётом FIELD_FIT/UNORM, GL0 и native/replay/Dry guards.

Фокусированный итог: **98 тестов, 5 файлов PASS** (24.26s, maxWorkers1).
`git diff --check`, целевой oxlint и map:check (67 модулей/981 файл) PASS.
Полный app TypeScript по actual tsconfig.app.json PASS через existing-deps
конфигурацию: явно указаны реальные React/lodash/chai typings. Первые две
попытки с неверным разрешением внешних typings сохранены отдельно и не
считаются проверкой исходников. Итоговый пустой log typecheck-final.log/exit0.

Логи и временные конфигурации находятся в `temp/zero-cost-flux/`.
Vitest и TypeScript используют реальные существующие зависимости
680-device-qa-guards/node_modules через явные aliases/paths; установки и symlinks нет.

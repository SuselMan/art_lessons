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

## Подготовленный аппаратный controller (не запускался)

`temp/zero-cost-flux/hardware/prepare.mjs` проверяет неизменный curated42
SHA ecbb146ddd9ecf3b6c3c46cc289245d92cbf246cf8225490eea70a9dee3ce1d9,
909 tracked source files и синтаксис всех внедряемых функций. Сохраняются все42
операции; established helper исполняет41 без единственной reference image_import.
Это диагностика physical checkpoint, не полное изображение комнаты.

`run-adreno.mjs` требует явные WC_QA_RUNTIME_ROOT, APP_URL, WC_QA_OUT,
WC_QA_DEPS_ROOT и собственную новую вкладку. Watchdog900s; prefix240s,
 target180s, arm90s, RAM preflight1700MiB/guard500MiB, serial/actual Adreno.
Никакие старые вкладки и runtime не меняет.

`checkpoint-function.js` прозрачно копирует full P/fixedP/V/cost/coverage до
первого реального mode15; TOTAL C сохраняется отдельно перед заимствованием
ca/cc. Все фактические14 carry и последующие mask commands записываются
с source/destination identity и immutable uniforms. Буферы сохраняют исходный
sampler filter. Capture cap256MiB; raw readback стримится по одному буферу
кусочками64KiB в INPUT-*.rgba.gz. ROI не растягивается до полного поля.

Каждый OLD/OFF/ON arm создаёт новые копии этого checkpoint и записывает полный
initialSHA; обязательны initial equality и old/off full output equality.
OLD использует отдельно подготовленный исходный WatercolorPasses580, его
исходные carry strings сверяются с текущими буквально. ON меняет только
zero flag. Immutable V/cost/coverage/fixedP/totalC и исходный checkpoint должны
сохраниться. Все полные выходы стримятся в lossless RGBA.gz. Singlepaint C
не является mobile carry, поэтому mode16 на нём не исполняется; отдельно
холодно компилируются исходный/новый P/C shaders с тремя salt (12 links).

Checkpoint arms заканчиваются перед diffusion: это carry-only proof.
Diffuse/tide/whole-room endpoint требует отдельного последующего прогона.
Контроллер не называет этот ограниченный результат полной parity.

## Отрицательный аппаратный результат REPLACE 5e621642

Samsung Adreno650, собственная вкладка1398 закрыта finally. 12 salted links,
GL0; full1536² OLD/OFF всех6 полей byteexact, initial10 полей exact.
Carry-only14commands на реальном42op tape (исполнен41 без image-reference).
ON заменял legacy zero-flow: профиль границы ухудшился: gap21.595→22.846
(+5.79%), fullP OFF/ON1486px/max6. Масса UNORM allP756292→756220;
дополнительная потеря72byteunits (.009493% initial), не continuous-mass proof.
Immutable V/cost/coverage/fixedP/Ctotal exact. Mobile C на singlepaint не
исполнялся. Это НЕ исправление кольца и НЕ whole-room endpoint proof.
Raw HOME:728-zero-cost-flux-runtime/temp/zero-cost-flux/hardware/
results-adreno-vps-old-off-on/report.json и offline-zero-face-analysis.json.
VPS та же относительная папка в728-zero-cost-flux. Первый HOME launcher
67057 завершился до вкладки: namespace cached helper; реальный59537 EXIT0.

## ADD-кандидат: полная legacy сумма плюс независимый поток

`diagnosticAdditiveZeroFaces=false` по умолчанию. Предыдущий REPLACE остаётся
отдельной отрицательной диагностикой; одновременный выбор запрещён до draw.
ADD вставляет отдельный reciprocal phi/4 exchange, затем исполняет буквально
весь исходный carry: прежние Σ, zero/positive weights, capacity и limiter.
Оба потока используют один immutable P/C donor, не результат первого потока.
Весь legacy outgoing≤k·travel; дополнительный outgoing≤k·travel, суммарно
при текущих .5/.35≤.35 donor. Все mobile P/C каналы имеют один donor ratio;
coverage/original dab geometry, V, cost не переносятся этим оператором.
Масса/цвет/positivity доказаны в continuous CPU, не выводятся из UNORM clamp.
Lazy P/C programs ADD отделены от REPLACE, forget invalid context handles и
destroy покрыты тестами. Route52 guard и physical mode16 остаются прежними.

Offline `temp/zero-cost-flux/add-offline.{mts,json}` использует настоящий
checkpoint ROI354×266, но замыкает её внешнюю границу; это НЕ полный GPU proof.
14 фактических stride/rate/band/tau команд, float64 без FIT/UNORM. Цвет здесь
синтетически пропорционален P: actual singlepaint TOTAL C не mobile oracle.
Масса2974.20392156865 сохраняется (ошибка~1e-11); min0. Изменены25282cells,
max23.7078 byte-equivalent. Gap boundary(-1→0)21.7627→6.2466 (−71.3%).
Это перспективная ограниченная оценка, не доказанное исчезновение кольца.
Старый continuous ROI OFF отличается от hardware OFF профилем на~.15
на inner-edge, внешняя граница/FIT/precision не совпадают; equality не заявлена.
Полный savedinput SHA записан в JSON. Ни5331, ни root runtime не изменены.

ADD final CPU:107PASS/5files/11.83sec/maxWorkers1; actual app TypeScript
PASS exit0, targeted oxlint PASS, map67modules/981files PASS, diffcheck PASS.
Outputs `temp/zero-cost-flux/add-{final-tests,typecheck,lint,map}.log`.
Hardware ADD не запускался. Прежний OLD/OFF full6field byteexact относится
только5e checkpoint; новый ADD/OFF ещё требует исполняемого аппаратного gate.

## ADD Adreno actual carry checkpoint

07bbfa56 on own5331, exec71529 EXIT0, own1403 CLOSEDfinally. Adreno650,
12 salted P/C links PASS;14carry/56mask. Initial10full1536² SHA exact across
OLD/OFF/ADD AND previous1398; OLD/OFF6wholefields byteexact. V/cost/cov/
fixedP/Ctotal unchanged, GL0/lostfalse/errors[]/network[].
Signed initial-support boundary gap21.59508→6.17044 (−71.43%); inner-edge
51.12355→66.29344, outer72.71863→72.46388. FullP8662px/max23.
Initial all4P mass758422 each, OFF756292, ADD756260; extra32byteunits
(.004219%initial), FIT/UNORM caveat. No actualmobileC on singlepaint; cold
C link+CPU ratio only, immutableTOTALC is not colourtransport proof.
Raw `temp/zero-cost-flux/hardware/results-adreno-vps-old-off-add/` on VPS
and HOME728-zero-cost-flux-runtime; offline-add-analysis.json and
density-OFF-ADD-signeddiff.png. ROI transform from previous actual metadata
is valid because all initial fields byteexact. Fullsolver/Dry/png still
UNTESTED: carry improvement is not final visual ring proof.
CPU fullsolver-controller syntax PASS, separatefulloriginal42→execution41
plus orderedfinalDry, OFF/ADD target-only diagnostic, no RoomFPS claim.

## Полный solver и конечный PNG на Samsung

OFF exec66759/own1407 и ADD29331/own1408 EXIT0/CLOSEDfinally, source07bb
не менялся. Source909files и fixture42SHA проверены; execution41+ordered
terminalDry даёт одинаковый journal42. Target61-onlyADD, прочие операции
legacy. До target carry P/C/V/coverage/cost ROI SHA одинаковы; target14
carry/56mask обязательны. Adreno650, GL0/lostfalse/errors[]/network[].
Физическая3508×2480/Medium, paper texture и flags phase/baked/rebase/async
одинаковы. Это standalone historical replay, не native latency/Room gate.

Конечный wholeRGBA отличается6375px/max29, bbox[969,499,1211,681],
alphaChanged0. Signed initialP-boundary finalRGB darkness: inner−1
94.144144→98.514801, outer0 100.466413→100.607098; gap6.322269→2.092297
(−66.91%). Профиль включает бумагу, диффузию, tide и последующиеoverlaps;
не является directmobileC/mass oracle. Последиффузии P ROI sum736407→736362,
послеdryP718498→718419; carry756292→756260. Это UNORM/FIT readout.
Выемка/каёмка слабее на парном контакте, внешний контур/форма сохраняются.
Нет утверждения всехколецисчезновения, mixedcolour/native/Undo parity
этим опытом не доказаны. DefaultOFF и отсутствиеrootintegration сохраняются.

Raw VPS/HOME: `temp/zero-cost-flux/hardware/results-fullsolver-{off,add}/`
report.json/whole.png/controller.mjs/page-function.js/controller-passport.json.
`fullsolver-analysis.json`, `fullsolver-OFF-ADD-signed-contact.png` (слеваOFF,
центрADD, справаусиленныйsigneddiff), `analyze-full-solver.mjs`. Всё
mirroredвHOME728-zero-cost-flux-runtime. СтараяREPLACEnegative evidence
сохранена. Actual mobileC absent наsinglepaint; общийCbeforemaskSHAequal
не заменяет mixedP/C transport hardware proof.

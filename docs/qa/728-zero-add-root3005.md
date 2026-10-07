# #728: ADD-only консервативный обмен на root3005

Основа3005a83c + packed-cost-domain054446e8 (own cherry df41200e).
Патч переносит только ADD-вариант: shader-derived extra reciprocal phi/4,
lazy P/C programs, captured Plan diagnosticAdditiveZeroFaces=false. Старые
REPLACE shader/program/Engine из5e не перенесены; CPU oracle также ADD-only.
DiagnosticCostDomainPaths/PackedCostPaths defaultsOFF сохранены. Positives,
zero legacy flow и вся Σ исполняются буквально после extra блока. Новый
shader наследует binary/packed decoding текущего literal legacy автоматически.

Все mobile P/C каналы имеют неизменяемый donor P.a denominator. Legacy
outgoing≤k*travel, extra≤k*travel, при текущих .5/.35 общий≤.35. Масса,
positivity и постоянный цвет доказаны continuous CPU. Для двухцветного C
проверены linear composition и одинаковая immutable P fraction. Не переносим
coverage/original dab geometry, V/cost. FIT/UNORM mass не объявлена точной.
Generic maximum principle positive-cost legacy не заявлен.

105tests/5files PASS15.58sec/maxWorkers1: numerical10, shader literalADD1,
program ownership2, Plan captured flags + existing packed controls, shader
suite. Actual app TypeScript PASS exit0; targeted lint PASS; diffcheck PASS;
map68modules/992files PASS. Dependency054 впервые добавила scripts/qa без
moduleREADME; узкий README tooling закрывает реальный map gap (и summary≤32).
Ранний ошибочный статус covered992 не был PASS: окончательный map log exit0.
Logs temp/zero-cost-flux/root-add-{final-tests,types-final,lint-final,map}.log.

## Аппаратная граница

Предыдущий ADD07bb gate на Adreno650: full1536 checkpointOLD/OFF exact,
extra14carry снижает signed boundary gap71.43%; полный original42→execution41
+orderedDry OFF/ADD снижает finalRGB gap66.91%. Whole3508×2480 differs6375px,
max29, alpha0changed; ring weaker, outer edge remains. Это положительная
reference geometry, НЕ проверка нового root3005+packed шейдера. Raw сохранён
в temp/zero-cost-flux/hardware/results-* VPS/HOME own5331, старые commits
24ef/ea5/ac550 остаются на agents/728-zero-cost-flux. Root model unchanged.

Новый CPU-prepared hardware/mixed-colour-function.js прямо создаёт разные
mobile red/blue C источники и общий immutable P, вызывает mode16 ПЕРЕД
mode15 с c=preP. Нельзя подменять Ctotal из singlepaint checkpoint мобильным
C. Mandatory Calpha==Palpha byteexact, независимые red/blue components
неизменны при смешении; positive-only/dryV/phaseOFF OFF/ADD exact. Все
источники и выходы сохраняются в памяти диагностического собственного
контекста64²; это explicit shader fixture, НЕ naturalRoom mixedwash. Mixed
Plan costmask по existing singlePaint eligibility fallback сохраняется,
не заявляем connectedguard execution для mixed route. GPU ещё НЕ запускался.

### Direct mixed fixture: две отозванные попытки

Аппаратный запуск 46831 завершился до оператора: fixture не вызвал
`initSettlePrograms()` перед `initFieldUniforms()`. Собственная Samsung-вкладка
1409 закрыта. Это не ошибка normal Engine и не результат shader gate.

Повтор 69261 исправил инициализацию: Adreno 650, восемь реальных программ,
15 salted compile/link успешны. Однако fixture создал screen buffer без данных
fullscreen quad. Во всех восьми случаях входная mobile-alpha mass 178310,
выходная 0, GL0. Поэтому нулевые различия P/C/composition **отозваны**: это
сравнение пустых выходов, не доказательство. Обязательный ADD-effect assert
завершил запуск EXIT1; собственная вкладка закрыта finally. Raw сохранён в
`temp/zero-cost-flux/hardware/results-root-add-mixed-retry1/report.json`.

Следующий fixture использует те же fullscreen vertices, что успешный full-field
checkpoint runner, и требует ненулевую массу P и C до сравнений. Tracked runtime
57713c66 не менялся. Natural Room helper подготовлен отдельно: реальные native
pointer/rAF две краски на одном wet wash, проверка paints>1 и фактического mode16.
Он пока не запущен и не считается аппаратным доказательством Room mixed route.

### Meaningful mixed mobile P/C Adreno gate

Исправленный запуск39067 завершён EXIT0, собственная вкладка закрыта finally.
Источник57713c66,919 tracked web/shared файлов проверены на HOME. Реальный
Adreno650; init8 и15 salted P/C/front/diffuse/brushDrag compile/link успешны,
GL0, lost=false, errors/network=[].

Восемь случаев64×64 имеют ненулевые выходы mobileP и mobileC. Во всех случаях
P.alpha=C.alpha байт-в-байт; отдельный красный компонент не меняется от наличия
синего и наоборот. Positive-only, dry-volume и phase-off OFF/ADD целые поля P/C
байт-в-байт одинаковы. Plateau ADD действительно работает:63px, max1; P252
изменённых байта, C125. Alpha mass input178310, OFF178300, ADD178325; это RGBA8
UNORM округление, не непрерывная математическая масса. Математическое сохранение
массы/positivity отдельно проверено CPU oracle, а этот аппаратный результат не
объявляется точной суммой целых байтов.

Raw: `temp/zero-cost-flux/hardware/results-root-add-mixed-retry2/report.json`,
`summary.json`, точные helper/controller/manifest рядом. Scope — прямой настоящий
mode16 mobileC на общем immutable P, не TOTAL C checkpoint singlePaint и не
обычный Room. Natural two-colour Room helper/protocol сохранены рядом как CPU
подготовка; этот сценарий пока не запущен. Default OFF остаётся; полного исчезновения
каёмки этот гейт не доказывает.

### Natural ordinary Room two-colour route

44985 завершён EXIT0, собственная Samsung-вкладка закрыта. Immutable HTTPS5329
источник d88bb7386639c258683982e2eb5d28745ee93651/backend4539:986 actual HOME
файлов повторно проверены по SHA. В inherited header raw осталась старая подпись
source; raw не переписан, рядом отдельный `source-correction.json` и паспорт.

Собственная Room PTmJEyXC, физическая640×480/fine. Два обычных native pointer/rAF
жеста имеют по одному принятому stroke; entries без pending. Prepare впервые
одна краска, затем две краски и landedWet1. Actual mobileC mode16 выполнен14раз,
ADD=true. Первый вход: P.alpha mass1517892,C1517892,V910269; immutable P после
оператора1517892, выход mobileC1517859>0. GL0. Это настоящая смешанная Room route,
а не искусственная подмена TOTAL C. Connected mask singlePaint-only не объявляем
активным для mixed. Renderer этот helper отдельно не записал; предшествующий
прямой тест того же Samsung endpoint записал Adreno650.

Этот гейт не захватывал wholePNG/Dry/UndoRedo/fresh equality и не заменяет их.
Плавность не доказана: второй gesture activeMax100ms/tailMax485ms. Raw:
`temp/zero-cost-flux/hardware/natural-room-encodeprofile_1791355787292/report.json`;
точные helper/controller/passport/correction рядом. Root default OFF не менялся.

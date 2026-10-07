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

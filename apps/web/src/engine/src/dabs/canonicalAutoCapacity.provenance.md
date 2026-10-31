# Ограниченная ёмкость original auto recipes

Первоначальный leaf — независимый pure helper; подключение в index.ts описано
ниже отдельным unit. Не предоставляет source,
profile, author или pointer grant. Не изменяет wire, shared decode, arithmetic,
пиксели, коэффициенты, RNG, scheduler, cache или существующие budgets.

Исходный actual Marker normal descriptor:
`imported-b8beafe9fc9e27b3bd21380a@27`, canonical SHA
`7fd13ac324a458b265a19fb696fe4c91820fa5a9512a29ae24a66c064799d5b5`.
При source35/ratio.5 и storedAngle1.5708 shared geometry даёт effective native
brush35×17. Старый fixed-angle bound19×37 недостаточен для реальных rotated
recipes: actual серверный producer имел29 ACK frames/17draws, max40×40; оба
baseline/hot guards пока отвергают rotation. Отдельная интеграция ждёт review.

Только defaultAuto+D получает rotation-independent L1 bound:
`ceil((effectiveNativeW+effectiveNativeH)*brushScale)+2` по каждой оси. Для Marker
54×54. Scale остаётся (0,1], ratio1, без mirrors; rotation конечная. Ширина и
высота берутся из существующей sourceAutoGeometry, включая native truncation;
+2 покрывает subpixel translation и округление углов. Это conservative storage
bound, не новая формула raster и не обещание универсальной libm parity.
Legacy/native/browser/Gaussian/soft остаются в прежнем fixed-angle domain:
нулевая rotation и исходная characteristicSize ceil+1. Старый пример19×37
сохранён. brushScale1/spikes2 и existing transformedMaskPrepassBudget остаются.

После trusted decoder assert повторно использует существующий shared
canonicalAutoCost/canonicalSoftAutoCost: source static и coverage/brush binding,
точные geometry dimensions, work/pixels остаются прежним законом. Нельзя
превратить широкую ёмкость в разрешение на изменённый source или geometry.
Сам helper не знает original read lifetime; эти полномочия остаются у caller.

Tests-first RED: module absent. GREEN4tests, один worker:
- actual frozen fixture author→adapter→encoder29frames/17draws (есть пустой
  control), max40, все recipes проходят54; никакого повторного выбора на replay;
- legacy19×37 и отказ ненулевой rotation;
- 1300 сочетаний scale/angle/subphase, включая subnormal/near1;
- конечные extreme angles, native truncation511.999999999 даёт1024×1024;
  следующий diameter512 превышает existing one-megapixel fence и отвергается;
- forged dimensions/static/coverage, scale0/>1, ratio, mirrors, NaN/Infinity,
  undersized capacity, oversize pin отвергаются.

Targeted app-options TypeScript и scoped oxlint проверяются отдельно; логи R52
`canonical-auto-capacity-focused.log` и `canonical-auto-capacity-targeted.log`.
Recording/CPU tests не доказывают реальные GPU pixels. После интеграции ROOT
проверит actual Samsung/SwiftShader. Устройств, сервисов, сборок, дополнительных
runtime/dependencies/disposable ресурсов этот leaf не создаёт.

## Подключение original baseline и hot recorded

Integration unit подключает helper в index.ts только для FULL original source pin:
planCanonicalEmptyRoom и appendOriginalRecorded. Обе проверки recipes выполняются
после существующего trusted decode. Local author metadata-only helper остаётся
неизменённым, pointer/tilt UI не открывается; guards profile/material/assets,
shared static/geometry law, companions, target union и logical budgets сохранены.
Никакого расширения mixed raster baseline.

Tests-first actual Marker fixture producer29frames/17draw:
- cold constructor RED на прежнем запрете rotation;
- hot initial empty/control RED: workspace19×37 вместо54×54;
- GREEN после integration: original normalized full-read, actual engine64×64,
  nonzero CPU mask upload и реальные вызовы draw MockGL; whole journal хранит
  original canonicalInput и serverSeq, после loss/restored SAMEentries/revision;
- empty original read → prepareOriginalRecorded/append всех29 original operations,
  уже первый пустой frame готовит54×54, тот же stable/owner, genuine END,
  export-ready и полный cleanup CPU/pool. Нет подстановки BEGIN или native pixels.

Один старый display test имел неверное ожидание PM-конвертации известного пустого
stable при OPEN wash. Это НЕ списано на integration без проверки:
контрфактический запуск ТОГО ЖЕ original test отдельно, без D tests, с committed
index.ts HEAD ea1f80085737edab542e82bacf1197c2d44f9413 воспроизвёл тот же FAIL
`transform` line82. Baseline index SHA256
5debed29e543ccb3f10c790b3299ac9169a66b0df2809ecdee51c001d415c065;
WIP SHA256 37821100a567d602a13a1a10c2a4aeeea32a87d0e2141f37662c064b1b4b4dfc
побайтно восстановлен finally и повторно проверен. Receipt/log R52
marker-auto-legacy-display-counterfactual.json/.log. Уже существующий knownblank
compositor law пропускает fine target с PaintTarget.contentRect===null до PM
конвертации. После ROOT review исправлен только тест: derived paint transform
по-прежнему обязателен; stable target metadata null и NO transform обязательны.
Production compositor не менялся. Legacy rotated/anisotropic/mirrored original
recipes по-прежнему отвергаются до canvas access отдельным actual read test.

Host suite и targeted TS/lint logs: marker-auto-integration-focused.log,
marker-auto-integration-targeted.log, marker-auto-integration-lint.log. Реальная
Samsung/SwiftShader проверка ND2 остаётся отдельной ROOT-проверкой после commit.

Финальный host результат integration:55/2 PASS, targeted49160 PASS, scopedlint
0errors (только существующие index warnings), diff-check PASS. Исходный временный
WIP backup удалён после exact restoration; компактный counterfactual receipt
и log сохранены. Runtime/devices/services не запускались. Commit ждёт ROOT review.

Явный warm frontier: hot29 test начинается с пустого UNPREPARED owner. Это НЕ
общее разрешение hot D после произвольной кисти. Уже warmed Basic2 mask41→D54
по-прежнему получает `Canonical source exceeds warm workspace; full resync
required`. Увеличение original workspace при idle/open epoch требует отдельного
staging/lifetime unit; текущая интеграция этот guard не снимает.

# Ограниченная ёмкость original auto recipes

Независимый pure helper, пока НЕ подключён в index.ts. Не предоставляет source,
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

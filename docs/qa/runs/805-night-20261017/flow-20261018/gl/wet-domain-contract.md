# Wet-domain audit: initial puddle, advancing water и reconstruction

Статус: read-only source audit 2026-10-18. User09:57 подтвердил **initial-fixed puddle для всех алгоритмов**. Ниже классифицируется существующий код, включая несоответствующие этому требованию advancing-water ветки. **Никаких shader/solver/PNG clipping изменений из этого документа не следует.** GPU reproducer потенциальных reconstruction ошибок ниже ещё не запускался. Номера macro1–43 обозначают lineage/эксперименты, а не43 независимых физических solver.

## Две разные оси

1. Меняется ли численная вода W в solver?
2. Разрешено ли ей входить в изначально сухие клетки?

Dynamic W может двигаться только внутри static initial domain. И наоборот, cost-front может расширять разрешённую область без численного water ledger. Reconstruction способна расширить отображаемый pigment support вообще без расширения W. Эти случаи нельзя объединить словом «растекание» и обрезать одной маской после PACK.

## Source-классификация зарегистрированных семейств

Таблица описывает source intent/операторы, **не универсальный device-proof** всех configs.

| Семейства / lineage | Wet domain / permeability | Что может расширить финальный pigment support |
|---|---|---|
| Fullres GL paper-deposition, correlated-paper, finite-volume; hybrid, macro-multiscale/geodesic/dense/hydraulic variants | Исходный aux.water не меняется; faces/path gates по нему. Часто min-water coarse blockers | Coarse reconstruction/detail/fine postprocess надо проверять отдельно; fullres finish у paper/finite-volume возвращает original при rawW0 |
| GL stable-fluids / lattice-diffusion | Fixed averaged coarse aux.water; velocity/pigment меняются, отдельного advancing water нет | Shared `gpu.finish` bilerp(domain) создаёт плавный eligibility halo относительно исходных fine pixels; не доказательство новой воды |
| GL artistic-front и bounded search-artistic-program | Стоимостный front растёт за initial water, transport идёт в cost-domain | Это prescribed geometric wet-front expansion, не W-conservation solver; rim/reconstruction отдельно |
| WGPU local integer diffusion direct/tiled/texture + matched GL | Raw fullres water immutable; local conductance gate | Это локальная диффузия внутри исходной воды, advancing-front нет |
| WGPU macro-implicit, macro2-sorption, macro3-fine-paper | Static coarse domain: `initialMacro` требует ALL fine pixels wet; raw fine mask участвует в pack | Implicit diffusion/adsorption и fine redistribution; не dynamic water. Macro-common pack отдельно возвращает original на rawW0/blocked owner |
| WGPU macro-darcy | W численно меняется, но environment.initialWet ограничивает обе стороны flow/mix | Dynamic water внутри initial domain; pack/reconstruction отдельно |
| WGPU macro2-particles, macro3 compact particles, macro4 safe particles | Immutable fullres environment.water, path/splat wet checks | Нет отдельной evolving water; корректность path connectivity/corner не тождественна endpoint-support gate |
| GL porous-water | Evolving W, но `gateAt` использует исходный aux.water | Dynamic W внутри fixed wet domain, не dry-paper-permeable |
| WGPU macro6 integer hydraulic (+ static hydraulic smooth/dither controls) | W меняется; aux.x=min raw water в8×8cell. `aux[i].x==0 || aux[j].x==0` запрещает exchange | Static blocked-cell domain; reconstruction может менять fine envelope, сама вода не выходит в blocked cells |
| WGPU macro4 capillary, macro5 capillary-smooth/curl, capillary-dither wrappers | Dynamic surface W + absorbed S; отсутствует immutable initial-wet wall gate. Head/suction позволяет входить в dry paper | Есть настоящая модель advancing water; bilinear/coarse reconstruction всё равно отдельная причина fine halo |
| WGPU macro8 integer-dynamic → macro9/10 wetness/exact-fused/program/dither →12/13/14 coherent | Dynamic W/S. Pressure/head не запрещает изначально dry receiver. Curl/mixing/absorption модифицируют перенос | Dry-paper-permeable модель. InitialW mask не является её обещанным конечным allowed domain |
| macro15/16/17/18/19/21/22/23/24/25/26/27/28/29 | Base water policy наследуется от dynamic8/14. CPU reducer/layout/quantization не создают новую water policy. Fine/rim используют coarse final W+S | Fine initialization/BLR/fine deposit/terminal rim/PACK могут менять pigment envelope независимо от W. Macro20 — reducer helper, не отдельный water solver |
| macro30/31 DT,32 pressure bound,33 single-pair,35 source-detail,36 capacity-fine,37 curl relaxation,38 coalesced,40 program-search,41 capacity-Lite | Та же dynamic/dry-permeable семья; коэффициенты меняют фактический front, но не вводят initial-domain wall | Wrappers/exact transforms не доказывают confinement. Fine/PACK policies проверяются отдельно от coarse W |
| macro34 GPU initializer /39 GPU initial fine /42 GPU capacity fine /43 GPU capacity Lite | Инициализатор той же dynamic physics; water policy не меняется от CPU→GPU reduction |42 fine соответствует36,43 Lite соответствует41. Файл `macro42-gpu-capacity-aware.ts` содержит ОБЕ factory; номера не путать |
| WGPU D2Q9 BGK | Advected/diffused/evaporated wet tracer, dry permeable; paper меняет damping, не immutable walls | Coarse bilinear pigment reconstruction + wet tracer dynamics. Final W не экспортируется как spatial proof |
| Native front8-detail-flow-v4 | Внутренний cost outward/inward front расширен, но final dry guard читает initialWater | `PuddleTarget` finalguard / outer `PagedPuddleTarget` guard возвращает raw внеinitialW0. Внутренняяsolvergeometry и публикуемыйfixed-domainoutput — разные этапы |

### Проверяемые source anchors

- `alternatives/gpu.ts:8,22`: `finish` bilerp(domain), `reduce` averaged water.
- `alternatives/artistic-front.ts:4–6`: seed water → cost expansion → transport gated cost.
- `alternatives/paper-deposition.ts:8`, `finite-volume.ts:17`, `macro2-dense.ts:20`: static aux gate/rawW0 returns original.
- `alternatives/porous-water.ts:5–6`: evolving water, но `gateAt` по immutable aux.
- `webgpu/macro-common.ts:7–9,24–28`: ALL-wet coarse domain, raw fine water/original restoration.
- `webgpu/macro-implicit.ts:29`, `macro-darcy.ts:20,45`: domain conductance; Darcy environment gate обеих сторон.
- `webgpu/macro2-particles.ts:30–51`: immutable wet/path/splat tests. Конкретный path sampling не объявлять новым supercover proof.
- `webgpu/macro6-integer-hydraulic.ts:18`: blocked coarse aux guard.
- `webgpu/macro4-capillary.ts:11–15`: suction/head, source W threshold, dry receiver не запрещён.
- `webgpu/macro8-integer-dynamic.ts:9–24`: head/pressure/advection без immutable wet blocker.
- `webgpu/macro11-fine-paper.ts:17–20`: fine wet определяется center `c.w+c.s>0`.
- `webgpu/macro17-smooth-fine-paper.ts:14`, `macro36-capacity-aware-fine.ts:8–9`: smooth M/D selection.
- `webgpu/macro41-capacity-aware-lite.ts:9–13`: capacity-based BLR selection без water predicate;43 GPU Lite использует тот же PACK.
- `webgpu/lbm.ts:40–49`: evolving wet tracer; PACK читает pigment, не возвращает water-support proof.
- Native `WatercolorSettlePlan.ts:584–617`: внутренний extended cost domain/band. `src/watercolor/puddle/PuddleTarget.ts:58–59,189` и `PagedPuddleTarget.ts:70,228–231`: final raw-water dry guard; ранее широкое утверждение, что native final допускает выход за initialW, было неверным.

## Potential reconstruction issue: пока source finding, не подтверждённый product bug

В macro17 smooth INIT выбирает interpolated M/D при отсутствии literal stationary, **независимо от center W/S**. Дальше исходный INIT ставит fineaux.wet=0, если center `c.w+c.s==0`, но уже записанный interpolated mobile/fineDeposit не обнуляет. Finepair с wet0 не переносит этот пигмент, однако PACK всё равно может его опубликовать.

Конструктивный source case: nearest dry coarse cell имеет W=S=M=D=0, рядом wet cell с M>0, literal данного fine pixel0. Halfpixel BLR у края dry owner даёт положительный M. Это состояние потенциально публикует pigment за coarse water domain. Actual job reachability/quantization и device-output reproducer ещё не проверены; **не называть это доказанным пользовательским bug**.

Macro36/42 capacity-fine выбирают BLR по capacity, также без water predicate. Macro41/43 Lite выбирают BLRtotal по unrounded alpha-capacity, не по W. Поэтому даже dynamic-water модель не оправдывает каждый post-PACK halo: он может быть reconstruction spill за фактически достигнутую воду.

Отдельный риск — coarse averaged initialization: одна мокрая fine точка может сделать весь coarse cell численно W>0. Это исходная discretization/lift, а не уже доказанное физическое продвижение воды. Mask resolution/lift обязателен в proof.

## Shared contract: required initial-fixed policy

Предлагаемые поля — **контракт/план, не код**:

- `wetPolicy`: `initial-fixed` | `advancing-water` | `prescribed-cost-front` | `unknown`.
- `domainBasis`: raw fine mask / min-water coarse mask / averaged coarse water / final dynamic state / explicit history; размер, origin, pixel scale, lift(nearest/full-cell/bilinear), threshold в исходных кодах.
- `surfaceWater`, `absorbedWater`, `everReachedWet`: какие поля существуют/экспортированы; provenance и SHA. Absorbed S и historical contact не называть surface W.
- `supportBeforeReconstruction`, `supportAfterInit`, `supportAfterFine`, `supportAfterPack`: any-material predicate, counts/SHA/selected bounding region. Для D.rgb/M positive-depth при M0 predicate должен смотреть ВСЕ4канала, а не только A.
- `initialMaterialSupport` и `initialMaterialSHA`: старый сухой пигмент уже может существовать за лужей. Его нельзя объявить новым leak лишь за ненулевой output. Отдельно проверять изменение сухого original.

### Policy A: initial-fixed

Allowed mask задаётся **исходной водой выбранной разрешённой геометрии**, не PNG blur и не post-hoc expanded bbox. Для строгого raw policy rawW0 — closed. Проверки: новые material вне allowed=0; вне allowed материал точно original; water-only no-pigment; fullDry identity; отсутствие переноса между отдельными wet connected components/через1px wall/corner. При coarse-min domain потери доступного мокрого пространства — отдельный functional limitation, не право потерять pigment.

Enforcement в faces/path/receiver, а не `output*=initialMask`: clipping после solve теряет/прячет массу и не чинит источник ошибки. User выбрал initial-fixed для всех. Текущие advancing-water модели этому контракту не соответствуют по дизайну; их нельзя молча «исправить» картинкой.

### Historical Policy B: advancing-water (не соответствует новому требованию)

Initial rawW **не** shared leak mask. Нужна actual reached wet-domain этой модели, с согласованными threshold/resolution/lift. Pigment может легитимно выйти за initial лужу, если туда действительно пришла вода. Текущий final W недостаточен: вода может уйти/впитаться, а D остаться. `Wfinal+Sfinal>0` — полезный свидетель, но без доказательства не универсальный substitute для **everReachedWet**. Необходим history OR positive surface/absorbed contacts в ходе solver либо доказанный эквивалент модели.

Allowed = initial material support ∪ reached wet support. Отдельный guard: новый pigment не появляется в клетках без allowed water contact. Existing dry material может меняться только после разрешённого wet contact; полная сухая сцена должна сохраняться. Для prescribed-cost-front allowed mask — actual front/coverage, а не выдуманный W ledger; этот art-contract маркируется отдельно от physical water transport.

## Instrumentation plan, без новых reads в обычном run

1. Opt-in диагностический прогон: перед solve сохранить исходные masks/SHAs; water/ever-wet semantics привязать к actual source/config/pipeline hash.
2. Использовать уже mapped coarse state после solve для W/S support/count/SHA (macro4/8 families уже копируют state в diagnostic readback). Сейчас summaries дают суммы/частично expanded counts, **не spatial masks**. Не объявлять counts proof конкретного halo.
3. Если нужна history, собрать отдельный OR-map внутри диагностического solver execution; это изменение scheduling/storage и требует отдельного review/GPU baseline. Не симулировать историю из одной конечной суммы воды.
4. Зафиксировать coarse M/D support до PACK, fine init M/D и fineaux wet, затем post-fine/post-PACK. Для описанного17/41 case сравнить конкретный fine pixel с center W/S и фактическим lift.
5. Вычислить `newMaterialOutsideAllowed` и `changedDryOriginal` по **сырым материалам**, не по composited PNG. Для densityprobe opaqueRGBA255 это особенно важно: display вообще не является carrier/support mask.
6. Минимальные сцены: dye+wet pool edge, isolated wet pools,1px wall/diagonal corner, водная лужа без пигмента, сухой пигмент, один мокрый пиксель внутри coarse8cell. Сравнить без PNG clipping и без оценки художественного качества.

## Что сейчас не экспортировано

Static fullres families могут использовать исходный input.water напрямую, дополнительного final water нет по определению. Evolving families чаще хранят W/S внутри, но `Candidate.metadata` публикует агрегаты, а не spatial final/history. Macro4 имеет expanded cell counters;8–43 coarse ledger имеет water sums, не карту. Fineaux wet не публичный snapshot. LBM wet tracer/GLporous water также не возвращаются стандартным readback. Поэтому **сегодня нельзя честно автоматизировать universal wet-history leak certificate на всех43 по существующему PNG+metadata**.

User09:57 выбрал initial-fixed: далее требуется отдельное согласованное изменение physics/domain/reconstruction и CPUproof до полнойGPUматрицы. Сам этот аудит не меняет kernels/worker/entry и не маскирует картинку. GPU не выполнялся.

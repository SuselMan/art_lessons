# OFF preview front/carry: доступный seam

Actual immutable owner имеет original, pigmentLoad/Base, colourLoad/Base,
solventLoad/Base, coverage. V.R/A — water support, не глубина. Full coverage.B
содержит standing-water material; support128=(0,0,0,support) его не заменяет.
Pressure/cost, effectiveWet/standing, budgetPx/costMax и merged predecessor base
в retained owner не захвачены. Поэтому нельзя объявить восстановленное поле
production pressure без дополнительного SOURCE scalar capture.

`PreviewFrontCarryGlPort.mjs` — исполняемый независимый GL primitive, ещё НЕ
Room-wired. Он требует явные frozen параметры, seed mode10 читает actual full
readonly coverage.B, unit waterFrontStep пишет два собственных Q8 pressure
128 поля. MaxFrontSteps явно1..32; один вызов=одна relaxation, не250-steps loop.
Carry16 сначала C с c=OLDP, затем15 P, fixedP общий; targets distinct. Страйд
только1: nearest axis не телепортируется через сухой texel. Plateau e читает
readonly actualV; маска домена и pressure должны сохранять сухой разделитель.

Это visual-only cost domain. Unit-stride с ограниченными32 relaxation может
не достичь полного production frontier; budget не увеличивается незаметно.
После carry mobile пара должна swap один раз, затем .45core/.2slices finite
clock; исходные/canonical8 никогда не меняются. Новый pressure ledger2Q8
128/owner=.125MiB, на3=.375MiB, totalpreview18.75MiB; пока ещё не аллоцирован.

CPU binder test доказывает порядок, OLD density, coverage источник и остановку
budget ДОGPUcall. Topology negative проверяет отдельные лужи. Это НЕGPUmass
proof. Требуются isolated actual shader P/C source+output sums, outside-support
nonzero0, plateau nonnegative, water-gap negative и source8SHA before/after.

Следующий конкретный capture seam: immutable source-options при seal должны
содержать water, radius/worldScale, effectiveWet/standing или явно помеченные
SOURCE-only их оценки, costbudget и production carry constants. Нельзя брать
in-progress parent scratch pressure; late predecessor land меняет canonical
context. Finalcanonical SAME NEWtape должен остаться прежним.

## Первое аппаратное наблюдение: неподвижный контроль, НЕ positive PASS

Surface ONE43182, fresh2129/controller2138,min1909/post2064MiB, ownclosed/release.
Raw `temp/device-runs/preview-front-carry-surface.json`. Source8SHA все совпали,
GL0/lostfalse, P/C alpha4880→4880, right/outside0; nonzero61→61. Operational
valid=true в старом контроллере проверял только safety, **не движение**; этот
raw не доказывает работающий carry или conservation при ненулевом flux.

В следующем packet positivegate требует actualP SHA change. Добавлены seed и
front pressure samples(центр/край/снаружи/сухаящель/соседняялужа), reachedcount,
P/C hashes и mass на шагах1/4/16. Пока без нового запуска. Алгебра:
receiver pressure>band(.65625) закрывает face; nonpositivegradient разрешён
только plateau cost≈0 и Vphasepositive. Здесь sourceV.A=1⇒phasepositive,
seedcoverage.B=1/standing1⇒deepseed1. Эти input свойства НЕдоказывают actual
pressurecostпослеGLseed/front. Реальная причина неподвижности пока не установлена;
увеличениеrate/шага/D не проводится.

## SOURCE scalar capture (offline)

Generated painter capture теперь сохраняет actual `profile.waterLevel`,
`landedWet`, `wetPeakHere` и максимум `scratch.standing.get(d)` по текущим own
drawable dabs. Это input-time scalars после existing delivery, без повторного
расчёта/GL/readback и без borrowing parent pressure. Они structuredClone в
immutable retained composite. Own radius для visual budget =max tipDiameter/2;
канонический mean/globalwashradius может отличаться — explicit SOURCE-only.

`PreviewCarrySourceOptions.mjs` получает production constants/functions от
caller, effectiveWet=max(capturedlanding,peak,standing), production spreadBudget
/S8 и frontSteps. Cap≤32 сообщает requestedFrontSteps/capped отдельно; он не
притворяется завершённым каноническим front. Scalar state/geometry обязательны,
missing/NaN/range failclosed. Retained captured4dab payload стал760228bytes
(раньше759885), +343 descriptors, ниже прежнего16MiB/owner bound.

После cherry обязательно снова `prepare-owner-fifo-runtime.mjs`; старый
ignored generated painter не имеет новых scalar descriptors. Original production
source/render uniforms/orderedcommands остаются неизменными.

## Pressure checkpoint ONE: фронт действует, carry пока нет

Raw `temp/device-runs/preview-front-carry-pressure-surface.json`: fresh2090,
controller2093,min1844/post1999MiB, собственная страница закрыта/RELEASE.
GL0/lostfalse/source8same. Seed61 reached→front208 reached. На краю dab
(44,64)pressureR0,height187, сосед(45,64)R14/255,height110; band=.65625.
Этот face не закрыт cost threshold. P/C SHA всё равно неизменны step1/4/16,
positivegate теперь корректно false. Причина не объявляется quantization:
при плоской capacity donor оценка .5*.25*.35*80≈3.5byte>0.5. Actual paper/
neighbour-normalization отличаются, поэтому это не полное численное GPUproof.

Следующий offline packet добавляет actual program getUniform snapshot после
первой пары16/15 (без дополнительного draw/readback), чтобы проверить rate,
normalizeddir, band, plateau tau и sampler indices на реальном program. Пока
аппаратно не запускался; коэффициенты остались прежними.

Actual program probe также проверяет texture-unitbindings символическими ownrole
labels, restoring ACTIVE_TEXTURE. Никаких secret/device fields. Для16 ожидаются
oldC/fixedP/oldP/pressure/V, для15 oldP/fixedP/fixedP/pressure/V.
`WC_CARRY_RIDGE=1` в literalshader делает capillarycapacity1 независимо отpaper
height; missingworld не объясняет неподвижность этого carry. Реальные bindings
ещё предстоит подтвердить, shader parameters не меняются.

### Исправление оценки и парный диагностический packet

Предыдущая оценка 3.5byte была ошибочной: она подставляла plateau weight
в положительный gradient face. Для записанных R0→14/255, costMax16
вес receiver=1.428767587, три plateau neighbours дают denominator193.428767587.
Поток=.5*.35*80*1.428767587/193.428767587=0.102532681byte, ниже Q8 half-byte.
Это условная алгебра ожидаемых uniforms, не аппаратный F32 результат.

Новый opt-in primitive заранее выделяет четыре F32 поля (1MiB), проверяет
реальный renderable Float32 FBO, копирует исходные Q8 P/C production mode1,
затем выполняет обе пары на ОДНОМ ранее вычисленном Q8 pressure, с одинаковыми
source/options/paper. Actual uniforms и texture bindings снимаются отдельно
для Q8/F32. Суммы указаны в Q8-equivalent units. Positive gate требует
неподвижный Q8 и расширившийся F32, неизменные восемь source SHA, нулевую
массу вне мокрой области/в соседней луже и парность alpha. Drift записывается
отдельно, без обещания строгой conservation. Только synthetic primitive;
никакого Room/endpoint/performance claim. Release Float fields после knownidle
в finally; hardware ещё не запускался.

### Actual Surface paired control — 09.10.2026

Raw `temp/device-runs/preview-front-carry-paired-surface.json`, compact
`preview-front-carry-paired-summary.json`. Preflight2056/controller2066MiB,
post1989MiB; собственная страница закрыта, Surface RELEASE.
Actual rgba32f/FBO allocator accepted; four fields1MiB. Initial GPU mode1
copy differs from exact Q8/255 by at most1.1102826e-8.

On SAME pressure/source/options/paper Q8 stays61nonzero, every P/C SHA unchanged;
Float32 expands61→89→141→174 at carry steps1/4/16. Both alpha sums
4880.000172704→4880.000116103 Q8-equivalent, drift−0.000056602
(−1.16e-8 relative); P/C alpha sums equal. Outsidewet/support and otherpond
mass both0. Eight source SHA unchanged, GLerror0/contextlostfalse.
Actual program uniforms in both arms equal (rate.5, dir1/128, travel.35,
pow3,costMax16,band.65625); texture roles pressure0/solventLoad/oldP/C correct.
Unused compile-specialized uniforms are null, not missing live bindings.

This confirms a sub-Q8 transport loss in THIS synthetic fixture without rate
tuning. It does not prove actualRoom preview quality, canonical equivalence
or speed. Readback perturbs timing; no latency/performance claim. Next OFF
Room port must use captured source fluid options, leased pressure pair, finite
budget and pen priority, while canonical eight sources remain readonly.

### Executable OFF Room packet

`CARRY_PREVIEW=1` maps to `diagCarryPreview=1`; requires finite+float+direct+
early+material-rebase and forbids artifact/floatLINEAR. Budget18.75MiB includes
six preinput Q8 pressure fields (+.375MiB), no field allocation at seal/DOWN.
Every owner receives immutable captured source fluid/geometry options. Source
coverage1024 seeds the cost; readonly retained solvent1024 gates carry;
preview-domain128 gates front, never replaces render coverage.

First eligible tick runs seed10/front1/pair16+15; later ticks front1+pair until
16 carry ticks. Requested front count is reported; this visual-only cap16 can
truncate production requested count and does not claim canonical pressure.
Both P/C read the same old P and same evolved pressure. Each tick then completes
ONE transport ticket, binds fixed+moving material and schedules display. Finite
clock timestamps advance while paused through carry/pen/hidden/older-owner,
preventing catchup. After carry, existing finite13 settling stages resume.
Noise sampler7 and canonical fields/shaders/options remain unchanged.

CPU runtime integration proves first-tick material submission, pen/hidden guards,
no finite catchup after long pause, stable allocation count, detached retirement
and pressure release once only after caller's shared GPU-idle certificate.
This is NOT physical first-pixel/frame-budget proof. ActualRoom movie/history/
NEW-tape original endpoint still require the next separately allocated hardware
cohort. Controller passport includes pressure/session/contract/source-options/
port and production constants; report CPUsubmit timing is not GPU timing.

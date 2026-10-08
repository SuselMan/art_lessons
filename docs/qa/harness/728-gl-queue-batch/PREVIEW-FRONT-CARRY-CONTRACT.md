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

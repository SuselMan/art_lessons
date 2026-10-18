# Fixed-wet B-lite — CPU policy oracle и один opt-in GPU proposal

User09:57 требует неподвижную **исходную** лужу для всех алгоритмов. Этот CPU этап проверяет геометрию/partition и возможность смешения тонкого края, а не обрезает готовую PNG. Source policy новая, старые sourceSHA/результаты не сохраняются. **GPUhost отсутствует.** Классификация старых семейств: [wet-domain-contract.md](wet-domain-contract.md).

## Disjoint initial partition

Исходные RGBA/water bytes не меняются; SHA проверяются до/после полного CPU упражнения. Для каждого8×8owner:

1. **Dry**: rawWater==0. Original остаётся literal byte-exact; mobile/deposit здесь всегда0.
2. **Bulk**: все64rawWater>0. Исходный wet pigment сводится к coarse M, coarse Dinitial0; coarse exchange только fullwet↔fullwet faces.
3. **Boundary**: rawWater>0 внутри partial owner. Пигмент НЕ становится stationary: это rawfine M=byte×257,D0. В coarse M его нет.

FineINIT объединяет owner-nearest coarse M/D вbulk и rawfineM вboundary. Fine gate строго rawWater>0, а не interpolated mask или c.W+c.S. Fine exchange открыт через bulk↔boundary wet neighbors. Оригинальный dry pigment вне лужи не стирается/не перекрашивается. Вывод не может исправить leaked mobile clipping-ом: `encodeFixedFine` **throws**, еслиM/D обнаружен вdry.

Это избегает полного minWater freeze: wet линии1/2/7px могут не иметь НИ ОДНОЙ coarseactivecell, но их fine pigment подвижен. Вода/пигмент не прыгают через сухую полосу или corner: coarse bulk cells целиком wet; fine пары только4-neighbor и оба endpoint wet.

## Ledger и существующий bounded common carrier

Здесь используется существующий premul-bounded common carrier/u16, НЕ independent-unbounded D.rgb/M из density CPU branch. Input с RGB>A отвергается, не clamp-ится. Нет claim native opticaldensity model equivalence.

Bulkencoder старый по единицам: `coarseC=floor((sum64(byteC)*257+32)/64)`. Каждый coarsechannel код представлен64finepixels. Поэтому coarseencoder delta наcell/channel от−31 до+32u16codes; глобальные4дельты публикуются отдельно. Это известное квантование, **не exact conservation исходных bytes**.

```
FineINIT_expectedRGBA = 64*sum(coarseFinalM+coarseFinalD) + 257*sum(rawBoundaryRGBA)
Combined_with_literal = FineINIT_expectedRGBA + 257*sum(rawDryRGBA)
```

Coarseledger относится только кbulk. Boundaryrawsource не потерян и не учтён дважды. После fineоператора четыре integerfineсуммы точно равныFineINITexpected, literalнеучаствует. Finalbyteencoder даёт свою отдельную `outputByteQuantizationDeltaRGBA`; его сумму нельзя назвать exact conserved rawmaterialmass.

Тест с bulkединичными компонентами даёт явные4encoderдельты `[-1,-2,-3,-5]`, тогдакак исходныеSHAs неизменны. Инъекция coarse pigment вpartial нарушает disjoint ledger и отвергается. Mobileвdry также отвергается доencoding.

## Обязательное смешение, а не только affinity

Existing `MACRO11_FINE_PAIR` использует alpha×paper-affinitydrive. Наflatpaper/equalalpha синий и жёлтый не смешаются. Поэтому CPUконтроль использует отдельный четверть-component mix на disjoint паре:

`q_C=sign(Cb−Ca)*floor((abs(Cb−Ca)*rate+128)/256)`, `rate≤64`.

Общий rate вычисляется ОДИН раз для RGBA. При alpha-gradient он уменьшается по доступной alpha-capacity receiver с учётомfixedD. Для equalalpha rate64 сохраняется, поэтому может обмениваться цвет без netalpha. Нет независимого clippingкаждогоцвета.

Четыре суммы exact: пара получает ±одно q. При fixed rate≤64 обе парные scalar output функции монотонны по двум входам и1-Lipschitz вintegersteps; один и тот же rate для RGB/A сохраняет RGB≤A. Alpha-transfer не превышает freeCapacity, потомучто rate≤floor(free×256/absDeltaAlpha), округление+128 не превышаетцелыйfree. Donor неотрицателен. Maxproducts65535×64+128 и65535×256 безопасныu32. Тест100kпар включаетoccupiedD и разныеMalpha.

Fineпорядок H-even,H-odd,V-even,V-odd; coarsegeometrycontrol H-even,V-even,H-odd,V-odd. **CoarseCPU использует quartermix STAND-IN**, ане actual physicalDt/coherent pressure WGSL. Это проверка coupled domain/ledger, не proof whole oldsolver вновойгеометрии.

## CPU результаты

`fixed-wet-b-lite-cpu.json` записывает source/input/outputSHA, partitioncounts,4raw/expected/finalledgers и encoderdeltas. На64², waterline длины48, fine12:

| Wet width | Bulk cells | Mobile partial wet pixels | Mixed pixels | Изменённыхdrypixels |
|---|---:|---:|---:|---:|
|1|0|48|6|0|
|2|0|96|12|0|
|7|0|336|42|0|
|16|12|0|768|0|

Число768 отражает выбранный coarsequartermixstand-in и не переносится нареальныйhydraulicnative solver. Отдельно тестируются alpha64 **и255** натонкихлиниях; пигмент реально переходит в adjacent emptywetpixel, ане толькоуспешноостаётсяliteral. Проверен цветовой exchange черезbulk/partialinterface. Wall/isolatedpool/corner/fullDry/water-onlyточны; внеW0 старыйцветнойliteralсохраняется. FineDизcoarseотдельноинициализируется; combinedledger/capacityвыдержаны.

7CPUtestsPASS(~0.63s), strictTypeScript/noUnused0. Это малые16–128grids, неGPU/performance/gallery/artscore. Currentu16M+D≤65535 физическиограничиваетконцентрацию: этотконтракт не становитсяunboundedopticaldensity лишь отfixed-wetpartition. OccupiedDможетуменьшатьполезныйmixrate; не обещатьдостаточноедвижениевкаждомsaturatedcase.

## Один representative GPU host — только proposal после review

Предлагаемый новыйID `wgsl-fixed-wet-b-lite-coherent`, opt-in; сначала одинconfig64coarsesteps/12finephases, а не переписывать30wrappers/рендерить125×13вслепую.

- Reuse actualmacro14create сinitializeroverride. Возвращает bulkM,D0,dryliterals; partialrawfine source отдельно. Исходный input остаётся original, deriveddata/metadata отражаютnewpolicy. CoarseW/S не обнулять: waterledger должен сохраняться. Inactivepartial не проводитмежcell.
- Coarseactive fullwetcap65535, inactivecap0. Actual `physicalDtSource(3,4)` получает явный unique faceguard `aux[i].cap==0 || aux[j].cap==0 → adsorb-local-return`. Все oldhydraulic arithmetic внутриopenbulkfaces сохраняются; sourceSHAновый. Aux.w/streamψнеперепаковывать; новоеcoarseGPUbinding не нужно дляэтогоограниченного inputконтракта.
- `observePacking` только захватывает borrowedbuffers. Собственныйfinehost создаётсяпослеуспешногоbasecreate; приошибкеуничтожаетownbuffers иbaseодинраз. Borrowedbuffersникогданеdestroy-итсам.
- OwnfineINIT bindings: finalcoarse,rawpartialRGBA8,originalrawmask/kind,dryliterals→bulkownerM/D +rawboundaryM. Нужныновыебуферы/биндинги: existingmacro11 sourceoverrideбезbindinghook недостаточен. Собственныйнебольшойmoduleбез monkeypatchобщихpasses предпочтителен.
- Обязательный componentmix сcapacity-limitedcommonrate иrawfinewetgate; papergrain/affinityпозже. Liteтакжетеперьимеетfineстадию. Не подменятьегосуществующим alpha-affinitypair, иначеequalalphacolorcontrolнепройдёт.
- FinalPACK только fineM+D+literal, безBLR17/36/41 ибезpostclip. BasePACK redundant, его промежуточныйрезультатнепубликуется. Новаяпрограмма/инициализация/политика явноотдельнаяalgorithmrevision.
- Diagnosticguards: rawW0mobile/deposit0, dryoutputinputexact, combinedledgerinit/afterfineall4, coarsequantdelta, bytequantdelta, actualsourcehashes, inputSHAs. ДоGPU — actualsourceinjection/groupownershiptests; потом1pxwall/thinline/equalalphacolors/bulkboundary/wateronly/dryнаодномустройстве иcrossdevice.

## Ограничения до художественного review

Boundarypigment входиттольковпозднююfineстадию иимееткороткийhorizon; тамнетраннегоcoarseadvection. Finequarter сейчас учитываетлишь W>0, неполныйwater-amplitudemodel. Ownerbulk8pxfield+12localphasesнеобещаетполностьюубратьpixelation. Это содержательноеизменениеphysics/стоимости, не exactoptimization и не выигрышкачества, покаGPU/картинкинепроверены.

Другая static/raw-maskисторическаясемьяможетоказатьсяготовойпополитике, advancing/reconstructionветки — нет. Доиндивидуальныхproofs показыватьнеконформность/FAIL, анефейковыйoutputmask. НовыеGPUhost/worker/entry/registryздесьнеписались. Собственныхпроцессов/сервисов/dependencycopiesнет.

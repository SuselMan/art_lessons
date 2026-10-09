# Owned lazy UP: фактический material readset и budget

Read-only source/CPU census после58ff57, никакой GPU COW/capture implementation. `owned-lazy-readset-census.mts` исполняет настоящий Plan.prepare/op0 в existing traceFixture: full/half, mixedP/C, foreign stencil, own+foreign solvent и supportsFilm варианты. Это command/read dependency witness, не GL pixels и не целая Engine snapshot.

## До op0 и canonical capture

| Role | Почему читается | Можно удержать безcopy? |
|---|---|---|
| inkLoad | mobile deposit →field.a | Только пока следующийsource не пишет его |
| inkBase либоinkSettled/inkLoad alias | OLD settled pigment →field.b; выбор поfilmGesture | Film base неизменяем доreleaseFilm; hold lifetime иgeneration обязателен |
| inkColor | mobile color →field.ca | Только эксклюзивныйowner |
| colorBase либоcolorSettled/inkColor alias | OLD color →field.cb | Тот жеbase/lifetime guard |
| coverage | stencil→field.coverage и reveal wetMask | Следующийstroke/front пишетcoverage; одногоmetadata clone недостаточно |
| solventLoad | standingwater, standalone либо sum сforeign | Следующийsourcewater изменяетload |
| foreignSolventLoad | второйwater carrier при наличии | Требуетphysicalowner/no subsequentforeignimport |
| original | Engine final/live composite base, неPlanop0 | Создан однажды доwash; можетretained доclearWash/resize/layerreplacement, но нельзяreuse afterpoolrelease |

Все четыре actual fixture варианта читают первые7 distinct resident roles. В fixture filmBase присутствует независимо отsupportsFilm, поэтому это не доказательство всех nonfilm fallback aliases. Logical1024² RGBA8 role=4MiB. Безaliases полный copy этих7 входов стоил бы28MiB наtile; original добавляет4MiB→32MiB. Это **не сумма всех нужных concurrency snapshots** и не measured allocation/time. Альтернатива retain+полнаяserialization owner может не добавлять copies, но задержит следующийsource. СтоимостьGPUcopy не измерялась и не объявлена приемлемой.

ПриS>1 Plan также захватывает fullresolution settledInk/settledColor peroverlap и field-resolutiona0/ca0. Это уже существующие allocated input snapshots; они не заменяютcoverage/film/source finalreadset и не дают права раннейreuse. Solvent sum использует временную pooled texture. Послеop0 solver читает собственные10fieldplanes и uploadedflow/foreign/paper; propertycache этихplanes не должна бытьпереназначена/освобождена доfinish/cancel. Одинfield1024² имеет40MiB этих10RGBA8planes (1536²→90MiB), плюсoptional inputs/temps; это size arithmetic, не actualmaximumRSS/driver budget.

## Послеcapture: finish/land/publication не читают только эти7

`CanonicalWatercolorSettlePlan.land/finish`1100–1200 повторно resolve-ит scratchentries. Читаетcurrentcoverage дляMAXmerge, settled/base records дляresample, runningfilm `inkBase+strokeInk` и `colorBase+strokeColor` дляrebase, drytargets дляprovisionaldry. Когда `trackRunningSource` есть, сначалаcoverageFilm→coverage, затемresetstrokeInk/strokeColor,copybases иsolventBase→solventLoad, затем execute `runningSourceCommands`: это retained arbitrary sourceclosure readset, не plain8buffers.

`Engine._finishRibbonStroke.composite` также выбираетrunningfilm inkLoad/inkColor либоinkDry/colorDry иoriginal/coverage поcurrenttarget. Reveal удерживаетbefore/pending/wetMask/entrygeometry с identityguard. Это read/write state, который следующийgesture способен изменить. `releaseFilm(capturedgesture)` освобождаетgeneration-specificcoverageFilm/inkBase/strokeInk/colorBase/strokeColor/solventBase/strokeSolvent. Нельзя дать старомуfinish поздно освободитьновыеfilm references.

Структурный union `SettlePlanTile` содержит17possible resident roles: original,coverage,coverageFilm,inkLoad,inkSettled,inkColor,colorSettled,strokeInk,inkBase,strokeColor,colorBase,inkDry,colorDry,solventLoad,foreignSolventLoad,solventBase,strokeSolvent.68MiB/tile есливсеdistinct1024² — лишьконсервативнаяarithmeticверхняяboundэтогоunion, НЕминимальнообязательныеcopies и НЕвесьGPUmemory (target/paper/reveal/fieldещёотдельно). `RibbonStrokeScratch.snapshot` копируеттолько8namedrecords иявноrejectscoverageFilm/materialGesture mismatch; поэтому использоватьего вслепуюкакfreezeвсегопрочитанного нельзя.

Controlpublication Undo/Dry/peer/structural operations обязаны дождатьсязавершенияownedwrite/land втотжeresidenttarget. Canonicallogacceptance отличаетсяотmaterialready; snapshot/checkpoint/exportблокируютсяpendingowner. Oldcapture наальтернативныеtextures само по себе неразрешаетoldlandпереписатьnewsource илиpeer. Exacttarget/layer/generation и FIFOpublication нужны даже приbytesclone.

## Что блокирует wiring

1. Caller должендоказатьcomplete readset/alias/lifetime **и write/publication target** ownership. CPUmetadata clone/holdscratch недоказательствоimmutability.
2. Еслиreadsetнеполный (coverageFilm/runningcommands/newfilm), sourceнеразрешатьдоcanonicalcapture/land; request сохранитьвFIFO, нетsilentdrop/pencilsubstitution. Этоsafeserialization, неUXspeedclaim.
3. Приreuseimmutableoriginal/base обязательныgeneration+poolpin+layer/contextidentity; controlsqueued доrelease. Никакихновыхblind8textureclones.
4. GPUcapture/copycost неизвестен, поэтомунеобещатькороткийUP. Полнейшийнaturalrender/protocolgate обязателендоflag/UI.

58ff прототипдоказываетFIFOprotocol/orderedPlantrace, аэтотcensusформулируетнедостающийphysicalownerproof. No runtimeactivation/nohardware/no newCOW. Broadstudyнаэтомостановлено.

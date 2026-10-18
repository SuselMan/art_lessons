# Antisymmetric density diffusion — bounded CPU numerical control

**CPU-only:4testsPASS, strictTypeScript/noUnused0.** Ни нового GPUhost, ни изменения worker/entry/kernels. Это поправка округления того же согласованного9pointrealstencil, не художественная победа и не exact replacement существующего cumulative integer operator.

## Оператор и доказательства

Для каждой открытой undirected пары соседей i,j и каждого независимого densitychannel C:

```
q(i←j) = sign(Cj−Ci) * floor(abs(Cj−Ci)*w_ij/65536)
Cnew_i = Ci + sum_j q(i←j)
```

Вес axial/diagonal/center ровно предыдущий: small2048/512/55296, larger8192/2048/24576; level0zeroexchange. Closed/dry/out-of-image faces имеютq0; diagonal проверяетобаsidewet темжеsupercover. Center coefficient реализован остатком послеsignedflux, не отдельным источникомуточнённойgrain. No cap/no premul/no state normalization.

- **Все4глобальные суммы exact**: q(i←j)=−q(j←i), для мокрой статической геометрии openfaceсимметрична. Каждый edge лишь меняетадрес плотности. Каналы независимы, D>M/zeroMpositiveD допустимы.
- **Положительность/maxprinciple**. Пусть m/M — минимум/максимум старого center+соседей. Общаявходящаячасть≤Σw*(M−Ci)/65536≤off*(M−Ci); исходящая≤off*(Ci−m). off=.15625/.625≤1. Значит m≤Cnew≤M. Это также защищаетлюбой prefix операцийотunderflow/overflow: дажееслисначалаприбавитьвсеpositiveиливычестьвсеnegative.
- **u32bounded**: Ci,Cj≤globalchannelSum≤2³¹−1; |difference|≤2³¹−1. Тотже exact `mulWeight16` high/low decomposition, независимо проверенный100kBigInt +предельнымиvalues в density-core tests. Максимум нерастёт, глобальныйledger сохраняется, атомарнаяперестановка не требуется в потенциальной gatherреализации.
- **Flatfixedpoint EXACT**: Ci=Cj⇒q0, в томчисле произвольные wetobstacles/edges, слабые1/8rawcodes,16steps.
- **D4 EXACT** для standaloneflux: все8вращений/отражений квадратнойсетки переносят открытыеedges с темже axial/diagonalweight; scalarrounding зависиттолькоотразности значений. CPU64/128 тестируетполноеarrayравенство всех8transform. ЭтоНЕclaimобexactcontinuousrotation или об overalladvection: собственный remap сохраняет прежний маленький directionalapportionbias.

## Сравнение на техже inputs/8шагов

Каждый stage: supplied advection→diffusion. `cpu-observations.json` и2PNG воспроизводимы `dense-density-flux-audit.cjs`. ВPNG3колонки:control0/small/larger; expтолькоCPUdisplay. Суммыrawdensity4exact во всехcases; compressedPNGмассунеизмеряет.

| Scene | cumulative small/larger mixedpixels | flux small/larger |
|---|---:|---:|
|Touchingpatches|359/499|132/296|
|Gap2pixels|275/410|64/216|
|Gap24pixels|0/0|0/0|
|Advectedseparatedblobs|9/37|0/16|

Gap24послеflux имеетsupportdistances21/17cells (control25), поэтомунеуспехmix неутверждаетсядопервогоконтакта. Gap2встречается, обменесть. Advectedblobs largerпереносит лишь59overlapdensitycodes — смешениепокаоченьслабое. Ниflatpapertexture, ниестественныйкрай, ни adsorption этим доказательствомнесоздаются. Наэтих картинках это в основном узкаямягкаяконтактнаяобласть; нельзяобъявлятьеёакварельнымуспехом.

## Честный tradeoff: weak-gradient freeze

Cumulativeoperator давал уflatweakdensity8wetwall maxdrift8/7rawcodes за8steps. Новыйflux: **0/0**. Single-steptranspose: **0changed /max0** противстарогоmax4rawcodes.

Но floor имеет deadzone: smallaxialперенос0при|delta|<32rawcodes, smalldiagonal<128; largeraxial<8, largerdiagonal<32. Изолированный8rawcodes (=1inputbyte) point smallполностьюfixed; largerдвигаетсяпоaxial. Этоquantizationfreeze слабыхградиентов, не искусственноеcapacityfreeze насыщенных областей. No massloss/phantomcolour; ноfaithful weakmix не гарантирован. Нельзяобещатьубратьвесьbanding одним operator.

Наreal-valued уровне этот же stencilлинеен, наintegerуровнеfloor-fluxнелинеен иотличаетсяотcumulativepacketrounding. Замена не является exactoptimization; старыйcumulativecontrolсохранёнбезправок.

## План/cleanup

Существующий отдельныйdensityprobe+raw16MiBledger/LUTdisplaycontractостаётсябудущимreview, нереализацией. Fluxможетбытьоднимgathercomputeс прежнимdensitypingpong безextraGPUstorage, но GPUcost/code/deviceproofотсутствуют. НикакихскоростныхвыводовпоCPU~1.3s иличислупроходов. Динамическаявода/параметрыvelocity/adsorptionнатуральногокрая всёещёнеявляютсячастьюэтогоCPUcontrol.

Собственныеbounded/density/diffusion/fluxисточники иcompactJSON/2PNG сохраняются. GPU/устройства/сервисы/новыеdependenciesнеиспользовались; собственныхживыхпроцессовнеосталось. Никакихизмененийчужихресурсов/USERрисунка.

Финальный combinedCPU run density+diffusion+flux: **14/14PASS**,2.66s; GPU0. Это завершение ограниченногоCPUэтапа, неoverallacceptanceновоймодели.

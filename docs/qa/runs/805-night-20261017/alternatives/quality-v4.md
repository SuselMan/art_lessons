# #805: correlated-paper deposition — третья quality-итерация

v8(`alternative-paper-deposition`)поrootGPU16PASS,dry/gapexact,
massratio.9966–.999,38–65ms; rootпосмотрелstrongwater-strokeиописалпочти
равномерныйhigh-frequencygrain/dither. Этицифрыотносятсякv8, неновомуядру.
СтарыйID/source/defaultsсохранены, новыйID`alternative-correlated-paper-deposition`.

ИзмененаТОЛЬКОterrainaffinityдлятогожетранспорта/адсорбции:
2separableGaussianblurpasses(RAWwater.rНЕразмывается); coarseheightснебольшой
fineкомпонентой. Масштабвfull1024pixels. ПослеGaussianнормированногоfilter
усиливаетсяконтраствысотвокруг.5, анецвет/яркость/масса. Этоиначеусреднилобайтный
papernoiseвплоский128иубралобыпобуждениедляпереноса. Receiveraffinityпо-прежнему
ограничена[.12,1], outgoingfraction≤share,целочисленныйsplit/depositionнеизменён.
Water-gradientedgepaint/rimнепоявляется, shaderfinaldryguardчитаетRAWaux.

КритическийCPUfinding: strided9tapσdraftмогсохранитьcheckerparityнаwhitepaper
noise. ОнНЕпередавалсянаGPU. ИтоговыйfilterимеетCONTIGUOUS7/11/17taps,
радиус3/5/8,σ=radius/2. CPUнормируетweights иэмититconstantunrolledGLSL
ДОсозданияпрограмм/таймера. GPUневычисляетexpи непросматриваетparitysubgrid.

Триpresets:
- smallclusters:scale3,micro.12,relief2.5,mobile.6,stride4,17passes;
- medium:scale5,micro.15,relief3.5,mobile.75,stride6,20passes;
- large:scale8,micro.1,relief4.5,mobile.8,stride8,20passes.

Добавлены2RGBA8fulltargets:≈36MiBbase+4MiBpersistentCPUaux. Нетновыхtextures
вrun, repeatrunсбрасываетterrain/pigment. Paperprocessingвнутриrun,такчтоего
стоимостьвключенаизмерением, не скрылитerrainработувupload. Oldcomparatorsнеизменены.

CPU`correlated-math.cjs`используетТОТЖЕexportterrainKernel, white-noise128²:
neighborcorrelation .823/.830/.893, meanadjacentdifference17.40/14.82/9.43
вместо84.86raw. Эточислаterrain, некачествопигментнойкартинки.
Rawwaterbyteidentityвобоихpasses, constantpaperнеполучаетискусственную
пространственнуюнеоднородность. Dry/gap/zero-pigmentарифметикаунаследована:
фильтрменяетлишьG. StrictTS+FakeGLlifecycle/configpassledgerPASS.

Пористаясредавэтойстилизацииимеетпространственнокоррелированнуюaffinity,
ноэтоНЕполноефизическоеwatercolor/MoXi. Нетclaimулучшенияхудожественного
качестваилискоростидоactualPNG/deviceproof; GPUsoleoperatorповторитcontrols.
АгентGPU/сервисы/зависимости/внешниересурсынесоздавал.

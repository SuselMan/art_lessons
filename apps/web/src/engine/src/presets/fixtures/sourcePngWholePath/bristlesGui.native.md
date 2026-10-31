# Реальный Bristles5 Flat: non-square PNG, upscale и buildup/directOver

Samsung SM-T970/Krita5.3.4.1, оригинальный индекс28 `f) Bristles-5 Flat`.
KPP49828B SHA71fa81d8ccdc3c4a6676133072f6e1595244a84658af44dbff931eec9483df66.
Исходный rake_flat.png12×27 opaqueRGBA grayscale,1194B,
SHA51e667bae1811db3798495dc4f1a0519ba41febd29b3b890753204822d0c2e5f.
CAS32² содержит исходный inverseQtgray в rect10,2,12,27: все324 values совпали,
padding0. Сжатые оригинальные1024 CAS bytes и SHA включены в fixture; inflate
ограничен1024. Krita4 bundle meta указывает CC-0, Deevad с производными кистей
Ramon Miranda/Razvanc/Radian/Wolthera/Storm/Scottyp и других.

Сохранены **brush12×27, scale2.5, literalangle1.5708**, manualspacing.06,
precision5. Угол не заменён точным pi/2, исходный PNG не нормализован до квадрата.
KisScalingSizeBrush::userEffectiveSize=max(width,height)*scale: GUI действительно
показал **67.5px**, без изменения slider. Native pyramid выбирает upscale4:
исходные48×108+border50×110, затем Qttransform даёт extents до69×31.

RNG-free источник: Size/Rotation/Scatter/Mirror выключены; Opacity pressure
`0,0;0.445596,0.113537;1,1;` активна, Flowconstant1. Нативный seed не подбирался.
Исходный PaintOpAction=**1**. Pinned bd6e8d061d2f0388c5b10278786cf0fe62e3135f
KisPaintingModeOptionData.cpp читает1→BUILDUP, остальные→WASH;
KisBrushBasedPaintOpSettings::paintIncremental возвращает BUILDUP,
KisResourcesSnapshot::needsIndirectPainting возвращает!paintIncremental.
Таким образом используется buildup/**directOver**, а не wash/alphaDarken.
CompositeOp normal остаётся over. Обе native refresh flags false→LONG_TIME.
SPDX GPL-2.0-or-later исходников сохранён в ignored source receipts.

До GUI rawsourceStamp скомпилирован и регенерирован SAME explicit mapped provider:
Eigen5.0.1/build5c6b74ca30b91f2c2529e6096f4230bec55e5056550b306734b2e9934a35d097,
binary7c1994d302412b2dde62e552a0f384a739cdbe57d18f3bfa549c012a0750d542,
sourceLockb34dcccb685a543c999aeb62f12753ecf76a2f5512f3983ebe9c6dbad0470bda.
Raw settings/options/points неизменны. Независимый оригинальный installedARM
curve constructor/floatTransfer256 под Unicorn FPCR0 без arithmetic hooks
подтвердил signedzero coefficients и **все256 F64 bits**. Их SHA проверяет тест.
Это эмуляция оригинального ARM-кода, не физическое ARM выполнение. Старый3.4
отличается191/256 values/max6.66e-16 и нового numerical grant не получил.

Свой прозрачный512²RGBA8/300dpi/100%/rotation0, None smoothing, black/UIopacity100.
Независимая sameprocess SVG полилиния до штриха сохранила translate11.58/23.1,
path99.84/76.8, stroke16.2. Quarter origin−924.75/−659.75 записан **до сравнения
PNG**, с явным ограничением десятичной сериализацииSVG. Реальный физический
путь973,756→1053,816:122events/source0x5002/device6/stylus2 за2059ms.
x/y/pressure — фактические сырыеF32bits; t — реальные eventTimes. Pressure
.25→.5→1→.25, UP0 толькоfinish, не pressure-zero paint. PointerCoords orientation/
tilt имеют исходные defaults0; drawingAngle производный изXY и здесь неактивен.
После штриха sameprocess ownpreset export: **все169params равны stock**,
SHA1fd1fb1417362269065d9f4f4e62519e6e529bce5db9f70543e65bcca81074b6.
Fresh whitelisted kritarc подтвердил defaultlinear1025F32 pressure для Samsung;
resource opacity выведена из UI100%. Creamy metadata не используется directOver.

Обычный mapped PNG sourceDescriptor(nativeinputprofile)→SAMEauthor→adapter→encoder
даёт **39draw/162frames**, каждый closed draw control имеет kinddirectOver.
Существующие NativeImageBank/pyramid/sourceImageTransformPixels(neon4,summed,
qt-wordsize64) и sourceFused32 installed-arm64-vector32-fused-fpcr0-v1 с
operator**over** дают полный nativeGUI512² RGBA SHA
`86fc330bd4760c724645c61c210c123922177ade7c04952f57239aeab8297e0b`:
**0 отличий из1,048,576 bytes/max0**. Видимых6747pixels, частичных6090,
разныхalpha256. ABI общей fused32 функции требует averageOpacity/flow даже
дляover; переданы opacityalias и actualconstantflow1, которые over kernel не
использует. Нет подмены на integer genericSC или alphaDarken. Resume после
каждого yield сохраняет все steps/RNG/frames/draws. Whole reference extracted
из native ownKRA mergedPNG; эквивалентность nativePNGwriter доказана ранее.

HOST preflight до GUI имел тот же результат на предыдущем sourcepacketstream:
здесь размер/угол постоянны и timing выключен, но fixture содержит **новые
реальные события2059ms**, а не переименованный старый ввод. Девять author/adapter/
source модулей по SHA одинаковы до/послеcapture. Это одна реальная кисть/штрих,
CPU numerical proof, не all118/editor/room/GPU admission или всецвета/настройки.

Strict cleanup: ownactivity/doc закрыты, nativePID отсутствует после нормального
выхода; force-stop не применялся. Ownruntimepreset удалён черезGUI, remoteKRA/
KPP/helper послеbyteverify; registered build и mappedprovider headers/compiler
удалены strictallproc audit с UID1000/mode0600registry. Airbrush600/All/Basic/Snap
и rotationfree/1/0 восстановлены; Chrome tabs/userdocs не менялись, ELF толькоRAM.
До запуска nativePID отсутствовал/Chromeforeground проверен. Pre-lock rotation
reference — предыдущий проверенныйcleanup, не отдельный свежий getter; конечные
free/1/0 проверены фактически. Compact ignoredR52: bristles28-stageA-proof.json,
bristles28-source/source-lock.json, native-gui-stroke52/source-author-receipt-bristles62.json,
bristles62-runtime-diff.json и bristles62-lifecycle.json (`cleanupComplete=true`).

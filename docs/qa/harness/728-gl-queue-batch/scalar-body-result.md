# #728: scalarworldpoint allocation — отрицательный CPU эксперимент

Найденнаялокальнаяallocation:4object/worldpoints наsegmentpolygonbody,16segments=64object/body. Generatedcandidate заменяетobjectx/y локальнымискалярнымизначениями с темижепорядкомвыражений иwriteFloat32. ИсходникmarkerRibbon, shape/taper иGPUпорядокнеизменены.

Стоfixtures прошлиorderedFloat32 byteexact: настоящийrecordedfinal8 плюс24детерминированныхcorpus пообоимnibshape/fillmode, zero-travel/size0/pressure0/negativezeroopacity/rotation/aspect. Объёмбайт/агрегатныйSHAиsourceSHAприведенывJSON. Этоbuilderoutput proof, неwholeorderedGPUcommand/Roomparity gate.

LinuxNode v22 CPUbench:5warmrounds,8alternatingOFF/ONrounds,13fixtures×8repeats вкаждомarm. Medianbaseline140,687мс/candidate141,284мс, ratio1,0042. ВыигрышНЕподтверждён; безhardwareclaim ибезpromotion/default/sourcechange. V8escapeanalysis можетужеустранятьвременныеобъекты, ноэто гипотеза, неallocation-profileдоказательство. Измеренныйwholegain отсутствует. Полныеrowtimes вJSONдляоценкишума. Неиспользовать медленнуюprivateVPSCPU какtabletlatency.

Воспроизведение: node prepare-scalar-body-candidate.mjs изкорня, esbuild baseline/candidate markerRibbon вtemp/device-runs/marker-{baseline,scalar}.mjs, затемnode scalar-body-bench.mjs (путяmd здесьотносятсякдиректорииэтогодокумента). Следующаяпольза — измеритьactualCPUgeometry отдельноотGLsubmission внутриsourceflush;26мс `_paintRibbonDabs` нельзяприписывать этимобъектам.

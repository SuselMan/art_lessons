# #748: первый расходящийся GPU draw

Тотже exact5op disjointinput SHA df1f5758da2b4f5a253bbd6f2d9542456868789f993428094ab6808349484826.
QA-only readback hook, renderer неизменён. Surface runtime05929ef0, AMDce68a405;
shader sources SHA **точно совпадают**, итоговые targets сохранили прежние
контрольные значения Intel2d5bebe5…/AMD9d3aa5ec…. Это валидирует наблюдатель:
между входами не было изменений депозита, новая remote-preview логика не участвует.

Первая разница — уже draw0, nibcoverage mode6, до bands/ink/fluid:
FBO до draw одинаковый нулевой30e14955…; после AMDae8dcb5d…/Intel77bf78bd….
Alpha sum139609/139617, R sum69749/69776. CPUargs/profile/dab одинаковы,
все общие доступные uniforms и draw/blend/state одинаковы. SUBPIXEL_BITS=4
обоим: гипотеза разных заявленных аппаратных subpixelgrid здесь не подтверждена.
На AMD u_tiltX/u_tiltY/u_opacity mode6 оптимизированы и getUniformLocation=null;
они не читаются coveragebranch. Имена явно сохранены в comparison, не выдаются
за отличающийся вход. Диагностика не меняет GLSL или draw uniforms.

Важное различие: AMD LOW/MED_FLOAT precision10, Intel23; HIGH_FLOAT23 обоим.
`uniform sampler2D u_wcNoiseTex` не имеет precision qualifier. По
[Khronos GLSLES1.00§4.5.3/§8](https://registry.khronos.org/OpenGL/specs/es/2.0/GLSL_ES_Specification_1.00.pdf)
неуточнённый sampler2D имеет lowp, а результат texture lookup получает precision
sampler. Highpfloat переменная после lowp fetch не восстанавливает потерянные биты.
Это **проверяемая гипотеза**, пока не аппаратное подтверждение причины:
следующий QA-only variant добавляет highp sampler2D, не меняя художественную
математику/параметры. Нужно проверить raw, затем отдельный equalraw→solver и
полный drytarget. Не принимать epsilon или только visualsimilarity.

`comparison.json` содержит первый input/state/buffer divergence и доступность
uniforms. `evidence.json` — первыйdraw полностью, shaderSHA и32drawSHA каждогоGPU.
Полные временные target binaries/fixture cleanup принадлежат qa_cases в
зарегистрированном cache728-online-adversarial-20261017; собственных GPUcontexts
у dry_contract нет. Источник программы: harness748-deposition-*.cjs.

Highp sampler гипотеза проверена и **отрицательная** для этого входа:
дваfreshcontexts, shaderSourcehook доengineconstructor,56programspatched наGPU.
Firstfragment действительно изменился147227→147254bytes, новыйSHA42b92073…,
но **все32before/after draws, raw/goal и drytarget накаждомGPU осталисьточно
baseline**. Это не поздняя подмена и не повод повторятьтотже samplercase.
Гипотеза не принимается как причина/productionfix. Детали:
`highp-sampler-negative.json`. Дальнейшая изоляция: per-draw scalarvaryings→uniforms,
затем analyticlocalUVизgl_FragCoord на этомисходном zero-angleinput.

Uniform-scalars также отрицательный: runtime659852ef, обаGPU32draw SHA
точно baseline, исходник специализированного nib действительно изменён.
Firstdraw readback:35pixels/43channels отличаются на1byte;23pixels
лежат внутри nominal coverage plateau. В частности целая строка при
worldY85.5 имеет alpha255 наобоихGPU, но R175/176. Поэтому отличие
не ограничено растушёвкой/SDFкраем. Следующий isolatedpixel-uv диагностирует
интерполяцию localUV; RGBA8rounding пока остаётся отдельной гипотезой.
Компактные данные: `uniform-scalars-negative.json`.

Pixel-UV также не даёт exact-сходимости: runtimeb5d29e7c, actual source
patch подтверждён. Firstdraw41pixels/57channels max1,23pixels на plateau.
AMDfinal остался9d3aa5ec…, Intelfinal изменился наee4110b4…. Это показывает
влияние вычисления координат, но не является исправлением. Productshader
не меняется. Детали `pixel-uv-negative.json`. Intelraw экспортирован
оператором в registeredprivatecache для отдельного equal-source solverpair;
этот последующий тест ещё не выполнен на момент записи.

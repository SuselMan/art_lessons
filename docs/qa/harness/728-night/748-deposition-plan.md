# #748: первая различающаяся операция deposition

Принцип: сначала найти первый расходящийся переход при **одинаковых точных
входных bytes**, потом менять только подтверждённый источник расхождения.
Fluidgoal пока не менять:8DITHERcases уже показали разный rawP/C/coverage.
SameGPU повторяемость есть, crossGPU — нет. Допуски к финальному target не вводятся.

Readonly code audit:
- nib/caps идут через DAB_VERT: GPU sin/cos(angle), неснапнутый transform;
  bands используют RIBBON_VERT с1/64px snappedpositions. Это разные механизмы.
- M70 включает specializedWatercolorNib: теже fragment формулы, но u_inkMode и
  u_depthWrite становятсяcompiletimeconst. ИсходныйfragmentSHA надо проверять.
- cap ellipseSDF использует интерполированный localUV/radius, dot/length/division;
  coverage/ink затем попадают вRGBA8fixedfunctionblend.
- bands несут interpolated edge/ink/ratios; общая noise lattice уже bakedtexture,
  но noiseinterpolation/coverage arithmetic всё ещёGPUfloat.
- same mathematical formula/highp не является доказательством побитовой
  межvendor идентичности. OpenGL ES допускает отличия precision/optimization;
  `invariant` не означает согласование разных реализаций. Не обещать исправление
  просто добавлением highp/округлением финиша.

Boundedprobe: `748-deposition-case.cjs`, исходный5op disjointinputSHA
 df1f5758da2b4f5a253bbd6f2d9542456868789f993428094ab6808349484826.
Дваfreshownedcontext AMD/Intel, limit32draws. QA_DITHER=default сохраняет baseline.
Hook только в своей странице: RibbonPasses nib/bands→drawArrays, без изменения
shader/uniforms/blend. Readback stalls, поэтому timingне интерпретировать.
Сохраняются exactCPUargs, bandFloat32SHA, actualuniforms, programsourceSHA,
actualdrawblend/viewport/subpixelstate и FBO SHA до/после каждогоdraw.
Контроль: итог должен оставаться прежним GPUbaseline9d3aa5ec…/2d5bebe5…;
еслиinstrumentation меняет target, эксперимент невалиден.
`748-compare-deposition.cjs left/report.json right/report.json` находитпервый
CPUinput/state/buffer divergence. `QA_CAPTURE_CALL=N` сохраняет ровноодин
RGBA dump firstdifferentdraw дляlocalpixel анализа;32полныхдампа не сохранять.

После подтверждения первогоdraw:
1. ЕслиCPUargs/Float32/uniforms ужеразличны — исправлять источник CPUinput,
   не shader. Проверить recordedstate/toolprofile/devicebudget не меняетвход.
2. Еслиbeforebuffers equal иafterразные — на этомодномpass A/B constantfragment
   (отделяет rasterizationcoverage) и исходныйfragment сBLENDoff вcleanFBO
   (отделяет fixedfunctionblend от fragmentmath). Это диагностические варианты,
   не новый художественныйrendering впродукте.
3. Еслиvarying/interpolation — проверить uniformderived cap geometry/localUV
   изgl_FragCoord наоднойфиксированнойбинарнойрешётке иsameCPUrotationinputs.
   Не переноситьsolution навсе shaders доточногоfirstdraw иcrossGPUproof.
4. Если арифметика/roundties — требуются явноточные промежуточные операции или
   canonical deterministic lookup/kernel. Случайная coarserounding не гарантирует
   точности (новыеties остаются) и меняетматериал. CPUcanonicaldeposition — возможная
   отдельнаяархитектурнаяграница с отдельнымperf/artreview, не скрытыйfallback.

Источник ограничений: Khronos WebGL1spec + GLSLES1.00 precision/invariance:
https://registry.khronos.org/webgl/specs/latest/1.0/
https://registry.khronos.org/OpenGL/specs/es/2.0/GLSL_ES_Specification_1.00.pdf

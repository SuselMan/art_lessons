# #805: три самостоятельных WebGL1-кандидата

Новые модели, не попытка сохранить старые пиксели. `alternatives/index.ts`
экспортирует общий registry `GLDefinition[]`, protocol.ts root неизменён.
Все1024 input/output, внутренние128/256/512, RGBA8 без extensions/MRT.
Compile/alloc только create, upload вне run. Каждая run сбрасывает ping-pong
из upload и исполняет фиксированный schedule; никаких clocks/random/readback.
Явное bilinear upsample. RGB premultiplied, paper не композитится внутриsolver.
DITHER временноOFF наrun, потомвосстановлен. Остальные draw state установлены
для owned FBO; это standalone harness, не installer вживойengine.

1. `stable-fluids.ts`: lowres velocity advection, divergence/Jacobi pressure,
   projection и pigment advection/diffusion. Signed velocity/pressure RGBA8
   encoded с точнымzero=128. Это стилизацияStableFluids с квантованием:
   малые скорости/pressure теряются, coarse grid можетстеретьтонкие детали;
   semi-Lagrangianadvection не сохраняет массу. Неclaimincompressibility.
2. `lattice-diffusion.ts`: D2Q9 соседство, symmetric donor pigment flux,
   water endpointgate, downhill paper bias, dyadicstride. Это НЕLBM BGK.
   Floatидеалдоquantize/clamp антисимметричен, ноRGBA8 и насыщение теряютмассу.
   Весаaxis1/6,diagonal1/12 sum1, totaloutgoing≤rate+downhill≤1.
3. `artistic-front.ts`: seed water→cheapdyadiccostfront, multiscale pigmentmix,
   approximate rim. Преднамеренно нехватка conservedmass наrim, возможныjump
   черезсухиещели; judge visualquality, невыдавать зафизическийsolver.

Почему неWebGL1D2Q9BGKздесь:9populations требуют≥3RGBAtextures ираздельных
collision/stream/macro проходов безMRT; их8bitstoredvalues даютособеннонизкую
точностьмалыхнаправленныхскоростей. НативныйgenuineLBM делаетqa_cases вWebGPU;
не маскируем stencil diffusion словомLBM и не дублируемегонаправление.

Начальные4configs наfamily. Это12проверяемыхточек, анеblindhundred variants.
`quality.ts` возвращает massratio/coveragegrowth/centroidshift/drygain,
chroma variance/edgeenergy/premul violations. Это наблюдениябезoldpixel target,
не универсальнаяавтоматическаяоценкакрасоты. `refine` даёт≤6coordinate-neighbours
дляследующегопоискапослеизмерений. СохранятьPareto latency/quality +humanPNG.
Зачёркивать blank, unchanged или unstable candidates независимоотвремени.

Источники модели (primary):
- Jos Stam, Stable Fluids1999: https://graphics.stanford.edu/courses/cs448-01-spring/papers/stam.pdf
- Mark Harris, GPU Gems ch38 (GPU Jacobi/advection/projection): https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu
- Augier etal., D2Q9 isotropy analysis: https://arxiv.org/abs/1110.0287

БезGPU этиshader ещёнепровереныдрайвером; CPU parse/strict-tsc неGPUproof,
тайминги/visual claims отсутствуют. Другиеruntime/протокол/сервисы/устройства
неправились. Новыеdeps/cache/processes не создавались; существующийesbuild/TS
используется readonly сwrite:false. Диск9.1GiBнастарте:полныхкопийнесоздавали.

# Native feather16 cache: QA-only readiness

Собственные файлы: webgpu/native-feather-cache-source.cjs/.d.cts, native-feather-cache.ts, native-feather-cache.test.cjs. 4CPU/fakeGL PASS, strict tsc/scopedlint0. GPU не запускался. Это изменённая численная реализация feather16, не старые пиксели и не обещание ускорения.

## Узкий hook, без production edits

Существующая собственная805сборка идёт через docs/qa/prototypes/mini-worker/build.cjs; свой engine — runtime.ts:createMiniRuntime, endpoint — qa-replay-scene / qa-run-scene-goal. Они уже держат immutable native raw source и сравнивают rawSceneHashes до/после каждого goal. Нужен отдельный новый opt-in build, старую страницу/JS не заменять.

Root-only wiring:

1. Новый flag QA_NATIVE_FEATHER_CACHE=1 defaultOFF. Не совмещать с lazy/oneoctave/runtime native-program swaps. Существующие frontZero/jumpZero допустимы при source gate. В onLoad raster/shaders.ts послеzero вызвать transformNativeFeatherModule; в onLoad raster/WatercolorFrontPaths.ts послеjumpzero вызвать transformPrefixFeatherModule. OFF loader/import path прежний.
2. В runtime собственный installer installNativeFeatherCache(e._watercolorPasses) сразу после engine creation, до любого solver/prefix. Нужен fresh _frontPaths===null. Программа уже должна содержать transformed native shader; installer проверяет actual attached fragment equality импортированному shader и marker. Если initialized prefix был создан раньше — failclosed, не удалять чужойcache.
3. Перед каждым diagnosticRunGoal/resetFromScratch вызвать cache.invalidate(); все операции fill остаются ВНУТРИ вызова waterFrontStep и общего totalReady, ни prefill передтаймером. Функции compile/link helper выполняются приinstall; texImage размера фактическогоfield может случиться наfirstfill и входит вtotalReady. Обработчикиgesture/morph/engine не менять.
4. После result/readback добавить stats. Хеши actual consumerSource/fillSource/prefixSources считать вне таймера; prefixShaderGuards≥2 дляprefixcase, fillDraws≥1, cacheHits>0, fills uniforms совпадаютactualfield. Накаждыйreset+одинаковыеcoords ожидается1fill. Geometrychange может датьдопfill; счётчикне скрывать. Stats source strings — не секреты, но в компактныйreport включатьSHA, анеполныеshadertexts.
5. В engine finally сначала cache.dispose(), затем исходныеpuddle/host/engine teardown. Cleanup idempotent, caller finally обязателен приcompile/prefix/reset/solvererrors. Послеdispose transformedengine не переиспользовать: это отдельнаяbuildветка, не runtimeпереключательмодели.

## Почему допустим unit7 reuse

В current native main ровно один wcFbm и нет wcNoise/wcLattice: его RHSfeather заменён. wcFrontHeightAt читает только paper texture; все film/cost/G/B/A expressions оставлены. В current prefix unitEdge ровно один wcFbm, его RHS заменён. Prefixaggregate/jump исполняют packedcost/height, не noise. Остальные noise helpers в общемGLSL остаются мёртвыми дляэтихentrypoints. CPUguards отвергают дополнительный прямой noise-вызов; runtimeprefixshaderguard отвергает untransformed unitEdge. Любой будущий косвенный noise helper требует повторного source review, а не автоматического утверждения guardуниверсальности.

В fillshader prefix возвращается к ORIGINAL lowp noise sampler: тот же shaderfbm/координаты. Consumer sampler становится highp для16bitdecode. Это intentionalnumericchange. Stamps.bindNoise перенаправлен только во время синхронного waterFrontStep; доfill вызывается сохранённыйoriginal. В finally unit7 сноваoriginalnoise, activeunit0 какbaseline. Другие material/shadercalls внеscope не перенаправляются. Foreign/borrowed/reentrant receiver отклоняется. Никаких другихjobs/renderer на этомGL параллельно нельзя.

## Геометрия, ресурс и состояние

ОдинRGBA8NEAREST/CLAMP fieldtexture, максимум1024²=4MiB. Не менять samplerparams originalnoise/paper. Key: width/height, originX=x0/S, originY=−(y0/S+field.h), scale, actualpaperworldsize/paperscale/textureidentity, noiseTextureidentity, sourceversion. Самfeather использует толькоresolution+origin+фиксированнуюnoise: остальныхuniformовнет. Нет отдельного seeduniform: seed описывается immutable bakednoise texture identity/version; inputseed не выдумывается. Metadatafills показываетnumericuniforms иlocalnoiseidentity.

Fill сохраняетFBO/viewport/program/VAO/arrayBuffer/activeTexture/unit7binding/colorMask и enableBLEND/SCISSOR/DEPTH/STENCIL/CULL/DITHER; собственныйVAO обязателен. DITHERoff толькоfill, originalrestored. FBOcompleteпроверяется, readPixels/glFinish/extraobserverdraw нет. Ошибка инвалидируетcache; callerfinallyосвобождаетownedprogram/shaders/texture/FBO/VAO. Самshape ≤1024guard, не переиспользовать дляA2.

## Gate оператору после review

Шесть одинаковых native snapshot input: wave,twocolors,pooldrop,gallery3/7/12. Не substituted converted805fixtures. Сначалаoriginalrepeat/cachevariant fullP/C/coverage hashes+pairednativePNGs иrawsourceimmutability; bytechangesexpectedqualified. Technicaldry/water-only отдельно. Затем balancedABBA/паузы с completion ивключённымcachefillвtiming; безperpassreadbacks. НикакогоMRT вэтойветке. СтарыйпубличныйMini не менялся, временныхресурсовавторне создавал.

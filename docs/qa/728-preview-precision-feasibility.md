# Preview-only precision после actual radial

Actual radial исключил прежнюю clipping-гипотезу: Poutside-source-coverage=0 на всех этапах. Coverage extension **не внедрять**. По сообщению root: P.B/A total1419→1203(step16)→769(step64),−45.8%; max98→22→10, moment-radius2.74→14.79→18.13, support23→174, step64→111 exact stationary. Material support/canvas alpha меняются, но реальные perceptual frames ещё оценивает GPU-agent. Это actual evidence потери Q8 total, не глобальная canonical loss.

## CPU сравнение на bounded flat-paper

`node docs/qa/harness/728-room-moment/preview-precision-oracle.mjs` PASS.32² grid, king8,D=.09, B*dh0, seed255, closededges,113steps. Сравнение численного хранения, не GPU time/actualFinepaper.

| Вариант | effective total113 | L1 к вещественному | storage writes113 |
|---|---:|---:|---:|
| Q8 каждый шаг |177|347.93|113|
| Float32 preview |255.000004|0.0000082|113|
| Q8+Float32 остаток |254.999998|0.0000060|226|
| округление каждые4шага |89|238.28|29|

Последний вариант не лучше по сохранению total: округление реже всё равно систематически теряет diffuse tail; промежуточные4шага в oracle используют вещественное хранение. Нельзя назвать это простой перестановкой нескольких существующих Q8 GPU draws — каждая framebuffer запись всё равно округляет. Для реализации пришлось бы держать float intermediates или расширенный kernel, после чего проще Float32. Меньше шагов за физическую секунду уменьшает pace spread и число потерь, но не решает stationary состояние: только откладывает его.

## Предпочтительный bounded кандидат: Float32 только P/C preview

Сохранить production diffusion формулы, stencil/domain128/порядок pairOLD→NEW; заменить **четыре** собственных P0/P1/C0/C1 RGBA8 поля на renderable RGBA32F. Water/domain остаютсяRGBA8; pending1024RGBA8. Инициализация из readonly Q8 source и canonical endpoint прежние. Composite читает normalized float P/C тем же кодом; финальный pendingRGBA8 всё равно округляет, но слабый хвост не исчезает до tone/composite. P/C коэффициенты одинаковы, численная ошибка не нулевая, GPU paired-colour/mass gate нужен.

Memory: четырe128²RGBA32F=1MiB вместо0.25MiB. Дополнение0.75MiB/slot,≤2.25MiB на3slots; preview pool13.125→15.375MiB, без нового1024rendercoverage. Прочие owner/source бюджеты отдельно.2diffusiondraws/tick сохраняются, bandwidth PC приблизительно×4; hardware время неизвестно. Не обещать ускорения или24fps.

В WebGL1 необходимо **оба** `OES_texture_float` и `WEBGL_color_buffer_float`, NEAREST фильтр, фактический framebuffer completeness/render/readback/GLerror gate. `staticPaperCache.ts:36` уже использует такую capability-пару, но это не доказательство preview texture allocator. Не нужны float-linear extension. При отсутствии renderableFloat32 explicit unsupported/Q8reference, без молчаливой новой физики. Half-float — отдельный кандидат с собственным extension/renderability/precisiongate, не автозамена.

## Остаток и почему не первый выбор

Q8+signedfloat residual хранит значение q+r и сохраняет effective total. Но если composite читает толькоq, в oracle display total падает до109 противeffective255: остаток должен участвовать и в каждомdiffusionread, и в materialcomposite. Это требует четырёх дополнительных signedfloat полей и дополнительных writes/bindings/шадерветвей; positive/negative residual нельзя положить в обычныйRGBA8 без explicitencoding. Если float доступен, directfloat проще и дешевле. Если недоступен, integer residual в дополнительныхRGBA8/packedsigned форматах — новый визуальный numerical solver, требует boundedproof и не обещает скорость.

## Следующий минимальный actual gate

DEFAULT-OFF isolated Float32-vsQ8 preview pair: тот же retainedsource8/paper/domain/recipe;16/64/113steps; full128 perchannel totals, extrema/finite/negative; radial support and final pendingmaterial/canvasimages; canonical8hash unchanged; zeroP/Cwatercontrol; proportionalcolour3channels+weak1Q8; actualGLcapability/errors/loss;3slotbudget. Float shader blending forbidden and aliasOLD/NEW forbidden. Timing cohort без readbacks отдельно. Runtime сейчас не изменён, candidate не включён.

## OFF allocator READY, без runtime интеграции

`PreviewPairedFloatAllocator.mjs` — отдельный кандидат только для четырёх P/C preview fields. enabled defaultfalse, принимает explicit existingQ8 allocator и excluded physical inputs. В ON требует total three-slot budget16121856bytes (15.375MiB), WebGL1 renderableFloat32 extensions, highp23; каждое actual128FBO проверяется. Неподдержка/неполныйFBO откатывает все частично приобретённыеhandles и возвращает **четыре Q8 поля**, не смешанную пару. Setup framebuffer/activeTexture/binding восстанавливаются. Draw seam повторяет beginReplaceDraw/endDraw production buffer, blendingOFF. destroyAfterKnownIdle идемпотентен; caller обязан доказатьidle до вызова — allocator не добавляет input fence.

FakeGL3tests PASS: OFF/unsupported/budget;4floatfields/state restore/releaseonce; thirdFBO failure rollback6handles→allQ8. Это не capability proof реальногоGPU. WebGL2/diagnostic wrapper этим allocator пока не поддерживается; отдельный raw-WebGL2 форматRGBA32F потребует нового gate, не полагаться на WebGL1 FLOATtexImage signature там.

Actual `WC_DIFFUSE_FRAG:3885–3983` не делает floor/round/channelwiseUNORM conversion. Действительные сохранённые guards: domainalpha≤.002→dry; clamp(domainalpha,0,1); finalmax(out4,0). Отрицательный numerical хвост clamp всё ещё может менять сумму; он остаётся literal. `wcResample mode0` имеет spatial sample-coordinate floor дляtexel selection, не quantization значения. Float storage поэтому удаляет framebufferQ8 write, а не эти guards. Composite depth/ink умножение2, thinPrior, coverage thresholds и finalpendingRGBA8 **сохраняются**. Не обещать идеальную непрерывную массу/видимость.

Existing `SealedPreviewTransport` требует lease.bytes===старыйPREVIEW_BYTES, existingpool тожефиксирован. Allocator намеренно не подключён: следующая интеграция должна изменить только typedphysical preview ledger/format, сохранить pool exclusions/epoch/fence/P-C pair и fallback ledger Q8. Нельзя просто передать новое поле под старым bytes и считатьbudgetподтверждённым. Перед hardware нужен tiny actualFloatFBO write/read/finite/copy init, затем paired113diffusion; скоростьотдельно.

## Capability packet и ledger integration seam

`728-preview-float-capability/run.mjs`: собственныйWebGL1 context128, без autorun. Controller вызывает window.runFloatCapability(); четыреownFloat32fields записываются одной постоянной fragmentформулой (.123456,.000001,.875,.5), читается1pixel/field=64bytes. Valid требует finite/maxerror<1e−6/4distincttextures/errors0/livecontext. Unsupported явноsupportedfalse/validfalse, не художественныйFAIL. build.mjs создаёт immutable≈7KiB assets+SHAmanifest; не подключёнRoom/runtime. SyntaxcheckPASS; actualGPU не запускался.

Rootreview исправлен: enabledON+lostcontext **throw/skip**, никакого createQ8 на deadGL.4fakeGLtestsPASS включая lost→zeroalloc. Unsupportedlivecapability оставляетQ8reference. Никакого LINEAR на Float32: нужны OES_texture_float_linear либо отдельныйmanual pairedbilinear presentationgate. Этот allocator толькоNEAREST.

Ledger integration design: PrewarmedPreviewPool constructor принимает OFFdefaultformat и explicitwholebudget, только p0/c0/p1/c1 выделяет candidatefactory; water/coverage/pending остаются existingQ8. Lease содержит format и реальные bytes (Q8 oldPREVIEW_BYTES, Float32 new per-slotbytes); SealedPreviewTransport проверяет format-specific bytes, pair одинаковыйformat/dimensions/physicalexclusion. При unsupportedfloat целыйslotQ8 и budgetledger actualbyte, не смешаннаяP/C. Candidatefields **не AccumulationBuffer API**: реализованы только texture/fbo,width,height,beginReplaceDraw,endDraw,destroy. Эти методы достаточно wcResample/diffuseStep/composite-read narrow port. copyTo/uploadPixels/mip/clear/regioncopy/maxblend отсутствуют: не cast как полныйBuffer и не передаватьвenginepool/source/finish. Init wcResample полностьюзаписывает128², поэтомуclearпередinit не нужен; еслиcaller добавитpartialwrite—явныйclearcontract обязателен. Existingoriginal.copyTo(pending) касаетсяQ8pending и остаётсяunchanged.

Преждеruntimeintegration capabilitygate+typednarrowporttest, thenfreeze pairedmass/colourGPU. Floatformatchange не улучшает8pxnearestpresentationgridсамопосебе; presentation interpolation отдельныйscope, неsilentfilterchange.

## Actual Surface tiny capability PASS

ONE own128 WebGL1 page, immutable5887packet/HTTP SHA checked. Persistent raw: `temp/fast-watercolor-night/preview-float-capability-surface-20261009/report.json`. OES_texture_float/WEBGL_color_buffer_float true, fragmenthighp23, fourRGBA32F FBO distinct. Каждый прочитанныйRGBA: `[0.12345600128173828,0.0000009999999974752427,0.875,0.5]`; maxerror1.2817e−9, finite,64readbackbytes, errors[],lostfalse. Preflight2179.38MiB; ownpageclosed, post2094.47MiB. Explicit Surface RELEASE отправлен root сразупослерезультата; дополнительныхarmsне запускалось.

Это подтверждает actualSurface floatstorage/render/readback capability. Не доказывает paireddiffusion conservation/colour, float-linearfilter, speed, Samsung/iPad или Roomintegration. CurrentQ8reference/defaults неизменны. Следующий OFF typedledger adapter может использовать этотформат тольков preview4fields; canonical8fields не заменять.

## Typed ledger proposal READY

`TypedPreviewPool.mjs` + `TypedPreviewTransport.mjs`: separate OFF modules, existing GPU runtime untouched. Pool3 slots physical ledger: Float32four128fields +Q8water/coverage/pending; any unsupportedslot→rollbackwholepool→allQ8. Format-specific leasebytes, immutable source physical exclusions, distinctpairIDs/sizes, noLINEAR, lostcontextfailclosed, idempotentlease release. Q8 factory-owned fields tag explicitformat; no canonicalformat mutation. Rollback protects excluded source IDs even if faulty factory returns sourcealias. Transport copied original chronological contract (seal/begin/complete/retire/releasefence) with typedbytes/formatguard; ticketP/C atomicpair unchanged.

3Node testsPASS: OFF/ONbytes+threeleases+cap4reject+pairflip+releaseonce; secondslot unsupported rollback21fields thenallQ8; siblingallocationfaultcleanup5handles plusbudget/loss/LINEARguards. Pair allocator fakeGL4tests separatelyPASS. Current modules are not `bindOwnedPreviewRuntime` wiring and not actualFloat113GPUproof. Required integration: constructor supplies typedpool/transport and real formatledger; rawreadbackFLOAT where needed, not unsignedbyte onfloatFBO; presentationNEAREST remains literal until separateinterpolationproposal. No speed/default/Roomclaims.

## Paired manual bilinear OFF helper

`previewPairedBilinear.mjs` содержит pureCPU reference и GLSLES100 snippet. SharedUV→texelspace `uv*size−.5`, floorconsistentfraction x−floor(x), clampedfourtexelcentres, одинаковыеweightsдляP/C. ВсеtexturefiltersNEAREST; float-linearextensionне требуется. `previewPairAt(uv,outp,outc)` делает8texturefetch (4+4), reconstructs **материальные moments**, не RGBпослеBeer–Lambert. BoundaryCLAMPtoedge соответствуетобычнойLINEARedgeclamp, alias/noise/sourceформулы не меняются.

3CPUtestsPASS: uniformconstants/partitionpositiveweights вcentre/edge/outside; affineinterior/texelcentre/boundary; proportionalP/Cratio плюсnegativemismatchedUV. Это convexinterpolation и сохранениеотношений приproportionalrecords, **не globalphysicalmassclaim** послеresampling1024: summationoverdestinationedges/clip/bounds можетменяться. Обаrecordsдолжныпринадлежать одномуcompletedfront/epoch. Не интерполироватьtau/RGBотдельно: сначалаP/C, потомexistingdepthprior/ratio/tone. Длясоседнихcomposite taps каждогоUVнадовызватьтотжеpairhelper;еслиonlycentralreadmanualноthinPrior/wcInkAvgосталисьNEAREST,качество/контрактинтерполяциинеполный. Existingmainshaderне менялся; actualcompile/floatprecision/finalimage ещёgate.

## Concurrent cap coordinator OFF proposal

`PreviewLeaseCoordinator.mjs` не содержитGL calls/timers/runtimepatch. Capacity3 **simultaneous unreleased** leases, а не lifetimeadmissions. Methods: admit(key,releaseAfterKnownIdle), reference(key,generation), retire(key,{detached:true,generation}), captureExistingIdleBoundary(), completeExistingIdle(certificate,'gl.finish'|'GpuBudgetFence.sync'), contextLost(). Certificatecaptured до ужеexisting sync, completed только после successfulsync+livecontext/currentgeneration. Callerизruntimeдолжен отметить все GPUreads/writes previewlease, включаяdisplaypending; безэтогосерийныйproofнеполон. No landcertificate, noDOWNfinish, no undoreset.

Retiredlease освобождается только когда lastref≤completedserial. Newcommandsaftercapture автоматически получают laterreference и не покрываются старымcertificate. Attachedlease не освобождается даже послеidle. Stalegenerationevents ignored; lossfailclosed, oldpoolневозвращаетсявnewgeneration. Callbackreleasefault сохраняетstate release-failed инеавтоповторяет/нереюзаетдвусмысленноосвобождённуюlease.

5Node testsPASS: cap4reject→existingidle→fourthadmitted; stalecertificateafternewcommand; generation/loss;detachguard/releasefault; actualcurrentphysicalpool+SealedPreviewTransport proofreusetoken/epoch exactlyaftercertificate. GPU/runtimefilesнеизменены. Следующийintegration должен убрать lifetimepreviewAdmissions толькосовместно сcoordinatoractualrefs+existing-syncnotification, иначеcapacityguard ослабленбезproof. Hardware≥4strokes/undo/rebase/loss отдельныйgate, поканеclaimcontinuousUX.

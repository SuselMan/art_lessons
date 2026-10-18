import {installNativeExpansion805} from '../native-expansion-805/expansion'
import {wrapExpansionTarget805} from '../native-expansion-805/live-target'
declare const __QA_EXPANSION_LIVE__:boolean
declare const __QA_NATIVE_EXPANSION_ARM__:string
import {runExpansionCase805} from '../native-expansion-805/measure'
declare const __QA_NATIVE_EXPANSION__:boolean
import {runNativeGpuTimedGoal805} from '../native-anatomy-805/gpu-group-goal'
import {runNativeDirectTimed} from '../native-mini-optimized805/native-direct-timed'
declare const __QA_NATIVE_MINI_OPTIMIZED__:boolean
declare const __QA_NATIVE_MINI_UI__:boolean
import {runNativeAnatomySnapshots} from '../native-anatomy-805/snapshot-goal'
import {runNativeAnatomyPrefix} from '../native-anatomy-805/prefix-goal'
import {runNativeAnatomyTrace} from '../native-anatomy-805/trace-goal'
import {runNativeTimedGoal} from './native-component-timed-goal'
import {runNativeComponentGoal} from './native-component-goal'
import {createNativeCommonSeed} from './native-common-seed'
import {readNativeCapture,armNativeCapture,captureNativeOnce} from './native-capture-805'
import {installNativeFeatherCache} from '../805-algorithm-search/webgpu/native-feather-cache'
declare const __QA_NATIVE_FEATHER_CACHE__:boolean
import {installFrontLazy} from './front-lazy'
import {installFrontJumpZero} from './front-jump-zero'
import {installFrontZero} from './front-zero'
import {installGatherSpecialization} from './gather-specialization'
declare const __QA_GATHER_SPECIALIZE__: boolean
import {PencilEngine} from '../../../../apps/web/src/engine/index'
import {watercolorPresetString,withWatercolorModel} from '../../../../apps/web/src/engine/src/presets/watercolorPresets'
import {createNativePuddleTarget} from '../mini-puddle/native-target-v70'
import {installInteractivePuddle} from './controller'
import {createCanvasAdapter} from './canvas-adapter'
export const APPROVED_TUNING={massThreshold:.298116,compositionThreshold:.474721,hueThreshold:.505521,hueStrength:1,backgroundStrength:.877969,minimumRegionArea:2994.2784,backgroundDistortion:.597529}
export type Settings={size:number;water:number;pigment:number;paint:string;color:string}
export async function createMiniRuntime(source:HTMLCanvasElement|OffscreenCanvas,settings:Settings,hardware:{maxTouchPoints:number;deviceMemory:number},emit:(row:any)=>void){
 if(typeof requestAnimationFrame!=='function')throw Error('requestAnimationFrame is unavailable in this worker')
 const size=1024,host=createCanvasAdapter(source,size)
 const engine=new PencilEngine(host.canvas,{userId:'native-local',pageWidth:size,pageHeight:size,paper:'fine',watercolorModel:'front8-detail-flow-v4',dryGpuFenceBatch:8,watercolorReview:true,joinedTouch:false,asyncFinish:false,materialPresentation:false,gradientFibres:true,reviewTouchDrawing:true})
 const e=engine as any
 let livePaths:ReturnType<typeof installNativeExpansion805>|null=null
 let featherCache:ReturnType<typeof installNativeFeatherCache>|null=null,restoreGather:(()=>void)|null=null,puddleForCleanup:ReturnType<typeof installInteractivePuddle>|null=null
 try{
 restoreGather=__QA_GATHER_SPECIALIZE__?installGatherSpecialization(e._watercolorPasses):null
 if(__QA_NATIVE_FEATHER_CACHE__)featherCache=installNativeFeatherCache(e._watercolorPasses)
 // WorkerNavigator omits touch capability. Preserve the engine's existing
 // main-device budget formula before any layer is allocated, not a new cap.
 e._gpuBudget=hardware.maxTouchPoints>1&&hardware.deviceMemory<=4?300*1024*1024:Infinity
 e._settlePlan.diagnosticMultilevelContact=8
 e._watercolorPasses.warmGradientFibres()
 ;(globalThis as any).__miniTuning={...APPROVED_TUNING}
 await engine.paperReady()
 engine.initLayer('local');engine.setBaseLayers(['local']);engine.setCompositeOrder([{id:'local',opacity:1}]);engine.setActiveLayer('local');engine.setTool('watercolor');engine.setLocked(false)
 let activeGesture:any=null,destroyed=false,lastStateAt=0,stepMax=0
 if(__QA_EXPANSION_LIVE__){if(!['original','smooth','noisy'].includes(__QA_NATIVE_EXPANSION_ARM__))throw Error('Invalid live paths profile');if(__QA_NATIVE_EXPANSION_ARM__!=='original')livePaths=installNativeExpansion805(e,null,{noise:__QA_NATIVE_EXPANSION_ARM__==='noisy',allWetMobile:false,radiusPx:24})}
 const createTarget:typeof createNativePuddleTarget=(...args)=>{const target=createNativePuddleTarget(...args);if(featherCache){const reset=target.resetFromScratch;target.resetFromScratch=function(...resetArgs){featherCache!.invalidate();return reset.apply(this,resetArgs)}}return livePaths?wrapExpansionTarget805(target,livePaths):target}
 const puddle=installInteractivePuddle(e,size,'morph',message=>emit({type:'status',message}),createTarget,{noPauses:true,onStep:row=>{stepMax=Math.max(stepMax,row.ms)},onGoal:target=>{if(activeGesture){const goalEpoch=performance.timeOrigin+performance.now();let fullGoalEpoch:number|undefined,fullCReadMs:number|undefined;if(__QA_NATIVE_MINI_UI__){const start=performance.now();puddle.diagnosticCompletedCReadback();fullCReadMs=performance.now()-start;fullGoalEpoch=performance.timeOrigin+performance.now()}emit({type:'goal',gesture:activeGesture,goalEpoch,fullGoalEpoch,fullCReadMs,target,stepMax,optimization:__QA_NATIVE_MINI_OPTIMIZED__?(globalThis as any).__qaNativeMiniNoMobile805:null,simplePaths:__QA_EXPANSION_LIVE__?{arm:__QA_NATIVE_EXPANSION_ARM__,metadata:livePaths?.metadata??null,stats:livePaths?{...livePaths.stats}:null}:null,glError:e.gl.getError()})}}})
 puddleForCleanup=puddle
 function apply(value:Settings){settings=value;engine.setSize(value.size);engine.setColor([1,3,5].map(i=>parseInt(value.color.slice(i,i+2),16)/255) as[number,number,number]);engine.setPencil(watercolorPresetString('normal',{water:value.water/100,pigment:value.pigment/100},value.paint))}
 apply(settings);puddle.setLive(true)
 async function goalHashes(buffers:Record<string,Uint8Array>){
  const hashes:Record<string,string>={}
  for(const [name,bytes] of Object.entries(buffers))hashes[name]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>)),b=>b.toString(16).padStart(2,'0')).join('')
  return hashes
 }
 async function cacheReport(){if(!featherCache)return undefined;const{fillSource,consumerSource,prefixSources,...counters}=featherCache.stats;const numeric={...counters,fills:counters.fills.map(row=>({...row}))},sources={fill:new TextEncoder().encode(fillSource),native:new TextEncoder().encode(consumerSource),...Object.fromEntries(prefixSources.map((source,i)=>['prefix'+i,new TextEncoder().encode(source)]))};return{...numeric,sourceSHA:await goalHashes(sources),qualification:'QA-only feather16 quantization; cachefill inside timed solve; source hashes outside interval; no other noise consumer in current native/prefix entrypoints'}}
 function stateLoop(){if(destroyed)return;const now=performance.now();if(now-lastStateAt>=100){lastStateAt=now;emit({type:'state',state:puddle.state,asyncError:String(e._wcAsyncError||''),stepMax})}requestAnimationFrame(stateLoop)}requestAnimationFrame(stateLoop)
 const dbg=e.gl.getExtension('WEBGL_debug_renderer_info')
 emit({type:'ready',profile:{id:__QA_EXPANSION_LIVE__?__QA_NATIVE_EXPANSION_ARM__:(__QA_NATIVE_MINI_OPTIMIZED__?'optimized':'original'),skipEmptyMobile:__QA_NATIVE_MINI_OPTIMIZED__,interactivePath:'native-direct',sourceBuild:__QA_EXPANSION_LIVE__?'805-expansion-live-v1':'805-native-mini-opt-v1',selection:__QA_EXPANSION_LIVE__?'original-Q-unchanged':undefined},renderer:dbg?e.gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):e.gl.getParameter(e.gl.RENDERER),budgetBytes:Number.isFinite(e._gpuBudget)?e._gpuBudget:null,flags:{...(__QA_NATIVE_FEATHER_CACHE__?{nativeFeatherCache:true}:{}),model:e._watercolorModel,asyncFinish:e._wcAsyncFinish,joinedTouch:e._wcJoinedTouch,materialPresentation:e._wcMaterialPresentation},tuning:APPROVED_TUNING,glError:e.gl.getError()})
 async function rawSceneHashes(){
  const f=puddle.diagnosticSource(),hashes:Record<string,string>={}
  for(const [name,buffer] of Object.entries({p:f.entry.inkLoad,c:f.entry.inkColor,coverage:f.entry.coverage,water:f.entry.solventLoad,foreignWater:f.entry.foreignSolventLoad,original:f.entry.original})){
   hashes[name]=buffer?(await goalHashes({[name]:(buffer as any).readPixels()}))[name]:'absent'
  }
  return hashes
 }
 let nativeCommonSeed:Awaited<ReturnType<typeof createNativeCommonSeed>>|null=null
 let replayedScene=false,expansionComputed=false,sceneRawSHA:Record<string,string>|null=null
 return {handle(message:any){if(destroyed)return;if(message.type==='qa-replay-scene'){
   void(async()=>{if(replayedScene)throw Error('One scene per fresh engine');replayedScene=true
    const operations=message.operations.map((op:any)=>({...op,preset:withWatercolorModel(op.preset,'front8-detail-flow-v4')}))
    const replay={...puddle.diagnosticReplayScene(operations),model:'front8-detail-flow-v4',presetOverrides:message.operations.map((op:any,i:number)=>({original:op.preset,replayed:operations[i].preset})),operationSHA:(await goalHashes({operations:new TextEncoder().encode(JSON.stringify(operations))})).operations}
    const f=puddle.diagnosticSource();armNativeCapture();captureNativeOnce(e,f.scratch,f.tile)
    const capture=await readNativeCapture();if(capture.manifest.nativeMaterialModel!=='front8-detail-flow-v4')throw Error('Unexpected replay material model '+capture.manifest.nativeMaterialModel);sceneRawSHA=await rawSceneHashes()
    emit({type:'qa-scene-ready',requestId:message.requestId,replay,rawSHA:sceneRawSHA,...capture,...(!message.capture?{blob:undefined}:{})})
   })().catch(error=>emit({type:'qa-scene-error',requestId:message.requestId,message:String((error as Error).stack??error)}))
  }else if(message.type==='qa-seed-common'){
   void(async()=>{if(!replayedScene||nativeCommonSeed)throw Error('Seed requires one fresh replay anchor and no previous seed');if(!['optical-density','premultiplied-rgb'].includes(message.encoding)||message.nativeInterpretation!=='numerical-carrier')throw Error('Explicit source encoding and numerical-carrier interpretation required');const bytes=new Uint8Array(await (message.blob as Blob).arrayBuffer());nativeCommonSeed=await createNativeCommonSeed(e,puddle,bytes,message.seed,message.encoding,message.sourceDisplayDensityScale??1);sceneRawSHA=await rawSceneHashes();emit({type:'qa-seed-common-ready',requestId:message.requestId,...nativeCommonSeed.proof,rawSHA:sceneRawSHA})})().catch(error=>emit({type:'qa-scene-error',requestId:message.requestId,message:String((error as Error).stack??error)}))
  }else if(message.type==='qa-seed-common-readback'){
   void(async()=>{if(!nativeCommonSeed)throw Error('No seeded source');emit({type:'qa-seed-common-ready',requestId:message.requestId,...await nativeCommonSeed.read()})})().catch(error=>emit({type:'qa-scene-error',requestId:message.requestId,message:String((error as Error).stack??error)}))
  }else if(message.type==='qa-native-anatomy-snapshots'){
   void(async()=>{if(!replayedScene||!sceneRawSHA||nativeCommonSeed||!(message.baseCommonBlob instanceof Blob))throw Error('Authored replay/base required');const result=await runNativeAnatomySnapshots(e,puddle,new Uint8Array(await message.baseCommonBlob.arrayBuffer()),message.mapping,message.selections);emit({type:'qa-native-anatomy-snapshots',requestId:message.requestId,...result})})().catch(error=>emit({type:'qa-scene-error',requestId:message.requestId,message:String((error as Error).stack??error)}))
  }else if(message.type==='qa-native-anatomy-prefix'){
   void(async()=>{if(!replayedScene||!sceneRawSHA||nativeCommonSeed)throw Error('Authored fresh replay source required');const result=await runNativeAnatomyPrefix(e,puddle,message.selection);const{snapshot,...evidence}=result;const{rgba,...description}=snapshot;emit({type:'qa-native-anatomy-prefix',requestId:message.requestId,...evidence,snapshot:description,snapshotBlob:new Blob([rgba.buffer as ArrayBuffer],{type:'application/octet-stream'})})})().catch(error=>emit({type:'qa-scene-error',requestId:message.requestId,message:String((error as Error).stack??error)}))
  }else if(message.type==='qa-run-component-timed'){
   void(async()=>{if(!replayedScene||!sceneRawSHA)throw Error('Replay source required');if(message.rows!=='gl-bottom-up'||!(message.baseCommonBlob instanceof Blob)||!/^([a-f0-9]{64})$/.test(message.expectedOutputSHA??''))throw Error('Explicit GL-row base and existing proof output SHA required');const mapping=message.mapping;if(mapping?.mode!==(nativeCommonSeed?'forward':'authored'))throw Error('Timed mapper/source mode mismatch');const base=new Uint8Array(await message.baseCommonBlob.arrayBuffer());const paper=nativeCommonSeed?nativeCommonSeed.withPaper:(fn:any)=>fn();if(message.anatomyTrace&&(message.optimizedPrep||message.skipUnpigmentedC))throw Error('Keep anatomy and optimized C-only wrapper measurements separate');const result=message.anatomyTrace===true?await runNativeAnatomyTrace(e,puddle,paper,base,mapping):await runNativeTimedGoal(e,puddle,paper,base,mapping,{optimizedPrep:message.optimizedPrep===true,skipUnpigmentedC:message.skipUnpigmentedC===true});if(result.outputSHA!==message.expectedOutputSHA)throw Error('Timed output differs from independently verified common carrier');const{output,...evidence}=result;emit({type:'qa-component-timed',requestId:message.requestId,...evidence,outputBlob:new Blob([output.buffer as ArrayBuffer],{type:'application/octet-stream'}),rows:'gl-bottom-up'})})().catch(error=>emit({type:'qa-scene-error',requestId:message.requestId,message:String((error as Error).stack??error)}))
  }else if(message.type==='qa-run-component-goal'){
   void(async()=>{if(!replayedScene||!sceneRawSHA)throw Error('Replay source required');const result=await runNativeComponentGoal(e,puddle,nativeCommonSeed?nativeCommonSeed.withPaper:(fn:any)=>fn(),event=>emit({type:'qa-component-progress',event}),nativeCommonSeed?.proof.planeSHA,message.inspectOnly===true,message.exportSourceEvidence===true);const rawSHAAfter=await rawSceneHashes();if(JSON.stringify(rawSHAAfter)!==JSON.stringify(sceneRawSHA))throw Error('Component run mutated source');emit({type:'qa-component-goal',requestId:message.requestId,proof:result.proof,hashes:result.hashes,rawSHAAfter,...('sourceEvidenceBlob'in result?{sourceEvidenceBlob:result.sourceEvidenceBlob,sourceEvidenceMetadata:result.sourceEvidenceMetadata}:{}),endpointBlob:new Blob([result.buffers.c.buffer as ArrayBuffer],{type:'application/octet-stream'}),endpointMetadata:{sha256:result.hashes.c,size,rows:'gl-bottom-up',seedEncodingScale:nativeCommonSeed?.proof.seedEncodingScale??null,sourceDisplayDensityScale:nativeCommonSeed?.proof.sourceDisplayDensityScale??null,nativeCompositeFair:false,policy:'native-component-isolated-v1'}})})().catch(error=>emit({type:'qa-scene-error',requestId:message.requestId,message:String((error as Error).stack??error)}))
  }else if(message.type==='qa-run-scene-goal'){
   void(async()=>{if(!replayedScene||!sceneRawSHA)throw Error('Replay scene first')
    const repeats=Math.max(1,Math.min(5,message.repeats??3)),samples=[],hashes:Record<string,string>[]=[]
    let endpoint:Uint8Array|undefined
    for(let i=0;i<repeats;i++){const before=featherCache?{fillDraws:featherCache.stats.fillDraws,consumerCalls:featherCache.stats.consumerCalls,cacheHits:featherCache.stats.cacheHits}:null;const sample=nativeCommonSeed?nativeCommonSeed.withPaper(()=>puddle.diagnosticRunGoal()):puddle.diagnosticRunGoal();samples.push({...sample,...(featherCache&&before?{nativeFeatherCache:{fillDraws:featherCache.stats.fillDraws-before.fillDraws,consumerCalls:featherCache.stats.consumerCalls-before.consumerCalls,cacheHits:featherCache.stats.cacheHits-before.cacheHits}}:{})});const readback=puddle.diagnosticGoalReadback();hashes.push(await goalHashes(readback));if(message.endpoint&&i===repeats-1)endpoint=readback.c}
    const rawSHAAfter=await rawSceneHashes();if(JSON.stringify(rawSHAAfter)!==JSON.stringify(sceneRawSHA))throw Error('Native run changed raw source')
    const blob=await new Promise<Blob>((resolve,reject)=>{if('convertToBlob'in source)source.convertToBlob({type:'image/png'}).then(resolve,reject);else source.toBlob(value=>value?resolve(value):reject(Error('PNG missing')),'image/png')})
    emit({type:'qa-scene-goal',requestId:message.requestId,samples,hashes,repeatExact:hashes.every(value=>JSON.stringify(value)===JSON.stringify(hashes[0])),rawSHAAfter,blob,...(featherCache?{nativeFeatherCache:await cacheReport()}:{}),...(endpoint?{endpointBlob:new Blob([endpoint.buffer as ArrayBuffer],{type:'application/octet-stream'}),endpointMetadata:{size,rows:'gl-bottom-up',channels:'native inkColor optical-depth RGB and pigment-mass A',sha256:hashes.at(-1)!.c,...(nativeCommonSeed?{commonEncoding:nativeCommonSeed.proof.sourceEncoding,seedEncodingScale:.5,sourceDisplayDensityScale:nativeCommonSeed.proof.sourceDisplayDensityScale,nativeInterpretation:'numerical-carrier',nativeCompositeFair:nativeCommonSeed.proof.nativeCompositeFair}:{}),qualification:nativeCommonSeed?'Synthetic seed endpoint: rowflip and fixedscale .5 (C byte identity), then SAME common compositor using original commonEncoding; native-composite PNG is diagnostic for RGB source.':'Existing last full result readback reused outside timing; convert with the INITIAL capture pigmentScale, never a new output-derived scale.'}}:{})})
   })().catch(error=>emit({type:'qa-scene-error',requestId:message.requestId,message:String((error as Error).stack??error)}))
  }else if(message.type==='pointer'){if(message.event.type==='pointerdown')stepMax=0;if(message.event.type==='pointerup')activeGesture={id:message.gestureId,captureUpEpoch:message.captureUpEpoch,dequeuedUpEpoch:performance.timeOrigin+performance.now()};const dequeuedEpoch=performance.timeOrigin+performance.now();host.pointer(message.event);emit({type:'processed',eventType:message.event.type,sequence:message.sequence,inputEpoch:message.sentEpoch,dequeuedEpoch,processedEpoch:performance.timeOrigin+performance.now(),gestureId:message.gestureId})}else if(message.type==='qa-expansion-png'){
   void(async()=>{if(!__QA_NATIVE_EXPANSION__||!replayedScene||nativeCommonSeed||!['input','goal'].includes(message.kind))throw Error('Expansion PNG replay/kind required');let outputSHA:Record<string,string>|undefined;if(message.kind==='goal'){puddle.diagnosticPresentGoal();outputSHA=await goalHashes(puddle.diagnosticGoalReadback())}else{if(expansionComputed)throw Error('Input PNG requires a fresh scene');puddle.diagnosticPresentInput()}const imageBlob=await new Promise<Blob>((resolve,reject)=>{'convertToBlob'in source?source.convertToBlob({type:'image/png'}).then(resolve,reject):source.toBlob(value=>value?resolve(value):reject(Error('No PNG')),'image/png')});emit({type:'qa-expansion-png',requestId:message.requestId,kind:message.kind,imageBlob,outputSHA,qualification:'Separate untimed native Mini canvas rendering, no output normalization or alternate compositor.'})})().catch(error=>emit({type:'qa-scene-error',requestId:message.requestId,message:String((error as Error).stack??error)}))
  }else if(message.type==='qa-expansion-input'){
   void(async()=>{if(!__QA_NATIVE_EXPANSION__||!replayedScene||nativeCommonSeed)throw Error('Expansion fresh authored replay required');const captured=await readNativeCapture(),rawC=puddle.diagnosticSource().entry.inkColor.readPixels();emit({type:'qa-expansion-input',requestId:message.requestId,manifest:captured.manifest,layout:{size,commonBytes:size*size*6,nativeCBytes:size*size*4,commonRows:'top-left',nativeCRows:'gl-bottom-up'},inputBlob:new Blob([captured.blob,new Uint8Array(rawC)],{type:'application/octet-stream'})})})().catch(error=>emit({type:'qa-scene-error',requestId:message.requestId,message:String((error as Error).stack??error)}))
  }else if(message.type==='qa-run-expansion'){
   void(async()=>{if(!__QA_NATIVE_EXPANSION__||!replayedScene||nativeCommonSeed)throw Error('Expansion fresh authored replay required');const result=await runExpansionCase805(e,puddle,fn=>fn(),message.arm,message.radiusPx??24);expansionComputed=true;const{output,...evidence}=result;emit({type:'qa-native-expansion',requestId:message.requestId,...evidence,profile:{id:'original'},outputBlob:new Blob([output.buffer as ArrayBuffer],{type:'application/octet-stream'}),rows:'gl-bottom-up'})})().catch(error=>emit({type:'qa-scene-error',requestId:message.requestId,message:String((error as Error).stack??error)}))
  }else if(message.type==='qa-run-native-gpu'){
   void runNativeGpuTimedGoal805({gl:e.gl,controller:puddle,runDirect:()=>runNativeDirectTimed(e,puddle,nativeCommonSeed?nativeCommonSeed.withPaper:(fn:any)=>fn()),mode:message.mode,baseline:message.baseline,timeoutMs:15000}).then(result=>{const{output,...evidence}=result;emit({type:'qa-native-gpu',requestId:message.requestId,...evidence,profile:{id:__QA_NATIVE_MINI_OPTIMIZED__?'optimized':'original'},outputBlob:new Blob([output.buffer as ArrayBuffer],{type:'application/octet-stream'}),rows:'gl-bottom-up'})}).catch(error=>emit({type:'qa-scene-error',requestId:message.requestId,message:String((error as Error).stack??error)}))
  }else if(message.type==='qa-run-native-direct'){
   void runNativeDirectTimed(e,puddle,nativeCommonSeed?nativeCommonSeed.withPaper:(fn:any)=>fn()).then(result=>{const{output,...evidence}=result;emit({type:'qa-native-direct',requestId:message.requestId,...evidence,profile:{id:__QA_EXPANSION_LIVE__?__QA_NATIVE_EXPANSION_ARM__:(__QA_NATIVE_MINI_OPTIMIZED__?'optimized':'original')},simplePaths:__QA_EXPANSION_LIVE__?{arm:__QA_NATIVE_EXPANSION_ARM__,metadata:livePaths?.metadata??null,stats:livePaths?{...livePaths.stats}:null}:null,optimization:__QA_NATIVE_MINI_OPTIMIZED__?(globalThis as any).__qaNativeMiniNoMobile805:null,outputBlob:new Blob([output.buffer as ArrayBuffer],{type:'application/octet-stream'}),rows:'gl-bottom-up'})}).catch(error=>emit({type:'qa-scene-error',requestId:message.requestId,message:String((error as Error).stack??error)}))
  }else if(message.type==='qa-native-capture'){
   void readNativeCapture().then(record=>emit({type:'qa-native-capture',requestId:message.requestId,...record})).catch(error=>emit({type:'error',message:String(error)}))
  }else if(message.type==='qa-arm-native-capture'){
   armNativeCapture();emit({type:'qa-native-armed',requestId:message.requestId})
  }else if(message.type==='qa-goal-hashes'||message.type==='qa-repeat-goal'){
   // Explicit prototype-only oracle. Readback/compilation is outside benchmarks.
   let restore:(()=>void)|null=null,restoreFront:(()=>void)|null=null,restoreJump:(()=>void)|null=null
   let frontJumpStats:{transformedShaders:number}|null=null
   try{if(featherCache&&(message.specializeFrontJumpZero||message.specializeFrontLazy||message.specializeFrontZero||message.specializeGather))throw Error('Native feather cache cannot stack runtime program swaps');if(message.specializeFrontJumpZero){const jump=installFrontJumpZero(e._watercolorPasses);restoreJump=jump;frontJumpStats=jump.stats}
    if(message.specializeFrontLazy&&message.specializeFrontZero)throw Error('Choose one native-front oracle')
    if(message.specializeFrontLazy)restoreFront=installFrontLazy(e._watercolorPasses)
    if(message.specializeFrontZero)restoreFront=installFrontZero(e._watercolorPasses)
    if(message.specializeGather&&!__QA_GATHER_SPECIALIZE__)restore=installGatherSpecialization(e._watercolorPasses)
    const bytes=message.type==='qa-repeat-goal'?puddle.diagnosticRepeatGoal(!!message.finalOnly,message.maxOps??100000):puddle.diagnosticGoalReadback()
    void goalHashes(bytes).then(hashes=>emit({type:'qa-goal-hashes',requestId:message.requestId,hashes,frontJumpStats})).catch(error=>emit({type:'error',message:String(error)}))
   }finally{try{restore?.()}finally{try{restoreFront?.()}finally{restoreJump?.()}}}
  }else if(message.type==='settings')apply(message.settings);else if(message.type==='dry')puddle.dry();else if(message.type==='export'){const finish=(blob:Blob|null)=>{if(!blob)throw Error('PNG export returned no data');emit({type:'png',blob})};if('convertToBlob'in source)source.convertToBlob({type:'image/png'}).then(finish).catch(error=>emit({type:'error',message:String(error)}));else source.toBlob(finish,'image/png')}},
 destroy(){destroyed=true;try{featherCache?.dispose()}finally{try{puddle.destroy()}finally{livePaths?.restore();nativeCommonSeed?.destroy();try{restoreGather?.()}finally{try{host.destroy()}finally{engine.destroy()}}}}}}
 }catch(error){try{featherCache?.dispose()}finally{try{puddleForCleanup?.destroy()}finally{livePaths?.restore();try{restoreGather?.()}finally{try{host.destroy()}finally{engine.destroy()}}}}throw error}
}

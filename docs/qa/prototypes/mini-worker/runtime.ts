import {readNativeCapture,armNativeCapture,captureNativeOnce} from './native-capture-805'
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
 const restoreGather=__QA_GATHER_SPECIALIZE__?installGatherSpecialization(e._watercolorPasses):null
 // WorkerNavigator omits touch capability. Preserve the engine's existing
 // main-device budget formula before any layer is allocated, not a new cap.
 e._gpuBudget=hardware.maxTouchPoints>1&&hardware.deviceMemory<=4?300*1024*1024:Infinity
 e._settlePlan.diagnosticMultilevelContact=8
 e._watercolorPasses.warmGradientFibres()
 ;(globalThis as any).__miniTuning={...APPROVED_TUNING}
 await engine.paperReady()
 engine.initLayer('local');engine.setBaseLayers(['local']);engine.setCompositeOrder([{id:'local',opacity:1}]);engine.setActiveLayer('local');engine.setTool('watercolor');engine.setLocked(false)
 let activeGesture:any=null,destroyed=false,lastStateAt=0,stepMax=0
 const puddle=installInteractivePuddle(e,size,'morph',message=>emit({type:'status',message}),createNativePuddleTarget,{noPauses:true,onStep:row=>{stepMax=Math.max(stepMax,row.ms)},onGoal:target=>{if(activeGesture)emit({type:'goal',gesture:activeGesture,goalEpoch:performance.timeOrigin+performance.now(),target,stepMax,glError:e.gl.getError()})}})
 function apply(value:Settings){settings=value;engine.setSize(value.size);engine.setColor([1,3,5].map(i=>parseInt(value.color.slice(i,i+2),16)/255) as[number,number,number]);engine.setPencil(watercolorPresetString('normal',{water:value.water/100,pigment:value.pigment/100},value.paint))}
 apply(settings);puddle.setLive(true)
 async function goalHashes(buffers:Record<string,Uint8Array>){
  const hashes:Record<string,string>={}
  for(const [name,bytes] of Object.entries(buffers))hashes[name]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>)),b=>b.toString(16).padStart(2,'0')).join('')
  return hashes
 }
 function stateLoop(){if(destroyed)return;const now=performance.now();if(now-lastStateAt>=100){lastStateAt=now;emit({type:'state',state:puddle.state,asyncError:String(e._wcAsyncError||''),stepMax})}requestAnimationFrame(stateLoop)}requestAnimationFrame(stateLoop)
 const dbg=e.gl.getExtension('WEBGL_debug_renderer_info')
 emit({type:'ready',renderer:dbg?e.gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):e.gl.getParameter(e.gl.RENDERER),budgetBytes:Number.isFinite(e._gpuBudget)?e._gpuBudget:null,flags:{model:e._watercolorModel,asyncFinish:e._wcAsyncFinish,joinedTouch:e._wcJoinedTouch,materialPresentation:e._wcMaterialPresentation},tuning:APPROVED_TUNING,glError:e.gl.getError()})
 async function rawSceneHashes(){
  const f=puddle.diagnosticSource(),hashes:Record<string,string>={}
  for(const [name,buffer] of Object.entries({p:f.entry.inkLoad,c:f.entry.inkColor,coverage:f.entry.coverage,water:f.entry.solventLoad,foreignWater:f.entry.foreignSolventLoad,original:f.entry.original})){
   hashes[name]=buffer?(await goalHashes({[name]:(buffer as any).readPixels()}))[name]:'absent'
  }
  return hashes
 }
 let replayedScene=false,sceneRawSHA:Record<string,string>|null=null
 return {handle(message:any){if(destroyed)return;if(message.type==='qa-replay-scene'){
   void(async()=>{if(replayedScene)throw Error('One scene per fresh engine');replayedScene=true
    const operations=message.operations.map((op:any)=>({...op,preset:withWatercolorModel(op.preset,'front8-detail-flow-v4')}))
    const replay={...puddle.diagnosticReplayScene(operations),model:'front8-detail-flow-v4',presetOverrides:message.operations.map((op:any,i:number)=>({original:op.preset,replayed:operations[i].preset})),operationSHA:(await goalHashes({operations:new TextEncoder().encode(JSON.stringify(operations))})).operations}
    const f=puddle.diagnosticSource();armNativeCapture();captureNativeOnce(e,f.scratch,f.tile)
    const capture=await readNativeCapture();if(capture.manifest.nativeMaterialModel!=='front8-detail-flow-v4')throw Error('Unexpected replay material model '+capture.manifest.nativeMaterialModel);sceneRawSHA=await rawSceneHashes()
    emit({type:'qa-scene-ready',requestId:message.requestId,replay,rawSHA:sceneRawSHA,...capture,...(!message.capture?{blob:undefined}:{})})
   })().catch(error=>emit({type:'qa-scene-error',requestId:message.requestId,message:String((error as Error).stack??error)}))
  }else if(message.type==='qa-run-scene-goal'){
   void(async()=>{if(!replayedScene||!sceneRawSHA)throw Error('Replay scene first')
    const repeats=Math.max(1,Math.min(5,message.repeats??3)),samples=[],hashes:Record<string,string>[]=[]
    let endpoint:Uint8Array|undefined
    for(let i=0;i<repeats;i++){samples.push(puddle.diagnosticRunGoal());const readback=puddle.diagnosticGoalReadback();hashes.push(await goalHashes(readback));if(message.endpoint&&i===repeats-1)endpoint=readback.c}
    const rawSHAAfter=await rawSceneHashes();if(JSON.stringify(rawSHAAfter)!==JSON.stringify(sceneRawSHA))throw Error('Native run changed raw source')
    const blob=await new Promise<Blob>((resolve,reject)=>{if('convertToBlob'in source)source.convertToBlob({type:'image/png'}).then(resolve,reject);else source.toBlob(value=>value?resolve(value):reject(Error('PNG missing')),'image/png')})
    emit({type:'qa-scene-goal',requestId:message.requestId,samples,hashes,repeatExact:hashes.every(value=>JSON.stringify(value)===JSON.stringify(hashes[0])),rawSHAAfter,blob,...(endpoint?{endpointBlob:new Blob([endpoint.buffer as ArrayBuffer],{type:'application/octet-stream'}),endpointMetadata:{size,rows:'gl-bottom-up',channels:'native inkColor optical-depth RGB and pigment-mass A',sha256:hashes.at(-1)!.c,qualification:'Existing last full result readback reused outside timing; convert with the INITIAL capture pigmentScale, never a new output-derived scale.'}}:{})})
   })().catch(error=>emit({type:'qa-scene-error',requestId:message.requestId,message:String((error as Error).stack??error)}))
  }else if(message.type==='pointer'){if(message.event.type==='pointerdown')stepMax=0;if(message.event.type==='pointerup')activeGesture={id:message.gestureId,captureUpEpoch:message.captureUpEpoch,dequeuedUpEpoch:performance.timeOrigin+performance.now()};const dequeuedEpoch=performance.timeOrigin+performance.now();host.pointer(message.event);emit({type:'processed',eventType:message.event.type,sequence:message.sequence,inputEpoch:message.sentEpoch,dequeuedEpoch,processedEpoch:performance.timeOrigin+performance.now(),gestureId:message.gestureId})}else if(message.type==='qa-native-capture'){
   void readNativeCapture().then(record=>emit({type:'qa-native-capture',requestId:message.requestId,...record})).catch(error=>emit({type:'error',message:String(error)}))
  }else if(message.type==='qa-arm-native-capture'){
   armNativeCapture();emit({type:'qa-native-armed',requestId:message.requestId})
  }else if(message.type==='qa-goal-hashes'||message.type==='qa-repeat-goal'){
   // Explicit prototype-only oracle. Readback/compilation is outside benchmarks.
   let restore:(()=>void)|null=null,restoreFront:(()=>void)|null=null,restoreJump:(()=>void)|null=null
   let frontJumpStats:{transformedShaders:number}|null=null
   try{if(message.specializeFrontJumpZero){const jump=installFrontJumpZero(e._watercolorPasses);restoreJump=jump;frontJumpStats=jump.stats}
    if(message.specializeFrontLazy&&message.specializeFrontZero)throw Error('Choose one native-front oracle')
    if(message.specializeFrontLazy)restoreFront=installFrontLazy(e._watercolorPasses)
    if(message.specializeFrontZero)restoreFront=installFrontZero(e._watercolorPasses)
    if(message.specializeGather&&!__QA_GATHER_SPECIALIZE__)restore=installGatherSpecialization(e._watercolorPasses)
    const bytes=message.type==='qa-repeat-goal'?puddle.diagnosticRepeatGoal(!!message.finalOnly,message.maxOps??100000):puddle.diagnosticGoalReadback()
    void goalHashes(bytes).then(hashes=>emit({type:'qa-goal-hashes',requestId:message.requestId,hashes,frontJumpStats})).catch(error=>emit({type:'error',message:String(error)}))
   }finally{try{restore?.()}finally{try{restoreFront?.()}finally{restoreJump?.()}}}
  }else if(message.type==='settings')apply(message.settings);else if(message.type==='dry')puddle.dry();else if(message.type==='export'){const finish=(blob:Blob|null)=>{if(!blob)throw Error('PNG export returned no data');emit({type:'png',blob})};if('convertToBlob'in source)source.convertToBlob({type:'image/png'}).then(finish).catch(error=>emit({type:'error',message:String(error)}));else source.toBlob(finish,'image/png')}},
 destroy(){destroyed=true;puddle.destroy();restoreGather?.();host.destroy();engine.destroy()}}
}

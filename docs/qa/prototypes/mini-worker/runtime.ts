import {installGatherSpecialization} from './gather-specialization'
declare const __QA_GATHER_SPECIALIZE__: boolean
import {PencilEngine} from '../../../../apps/web/src/engine/index'
import {watercolorPresetString} from '../../../../apps/web/src/engine/src/presets/watercolorPresets'
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
 return {handle(message:any){if(destroyed)return;if(message.type==='pointer'){if(message.event.type==='pointerdown')stepMax=0;if(message.event.type==='pointerup')activeGesture={id:message.gestureId,captureUpEpoch:message.captureUpEpoch,dequeuedUpEpoch:performance.timeOrigin+performance.now()};const dequeuedEpoch=performance.timeOrigin+performance.now();host.pointer(message.event);emit({type:'processed',eventType:message.event.type,sequence:message.sequence,inputEpoch:message.sentEpoch,dequeuedEpoch,processedEpoch:performance.timeOrigin+performance.now(),gestureId:message.gestureId})}else if(message.type==='qa-goal-hashes'||message.type==='qa-repeat-goal'){
   // Explicit prototype-only oracle. Readback/compilation is outside benchmarks.
   let restore:(()=>void)|null=null
   try{if(message.specializeGather&&!__QA_GATHER_SPECIALIZE__)restore=installGatherSpecialization(e._watercolorPasses)
    const bytes=message.type==='qa-repeat-goal'?puddle.diagnosticRepeatGoal(!!message.finalOnly,message.maxOps??100000):puddle.diagnosticGoalReadback()
    void goalHashes(bytes).then(hashes=>emit({type:'qa-goal-hashes',requestId:message.requestId,hashes})).catch(error=>emit({type:'error',message:String(error)}))
   }finally{restore?.()}
  }else if(message.type==='settings')apply(message.settings);else if(message.type==='dry')puddle.dry();else if(message.type==='export'){const finish=(blob:Blob|null)=>{if(!blob)throw Error('PNG export returned no data');emit({type:'png',blob})};if('convertToBlob'in source)source.convertToBlob({type:'image/png'}).then(finish).catch(error=>emit({type:'error',message:String(error)}));else source.toBlob(finish,'image/png')}},
 destroy(){destroyed=true;puddle.destroy();restoreGather?.();host.destroy();engine.destroy()}}
}

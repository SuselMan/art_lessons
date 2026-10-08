import type {StrokeOperation} from '@grafetto/shared'
import {PencilEngine} from '../../../../apps/web/src/engine/index'
import {getPaperBytes} from '../../../../apps/web/src/engine/src/paper/paperLoader'
import {CanonicalWatercolorWebGpu} from '../../../../apps/web/src/engine/src/webgpuCanonical/backend'
import {CanonicalBoundedSceneRunner} from '../../../../apps/web/src/engine/src/webgpuCanonical/boundedSceneRunner'
import {captureActualGlSource,installCommonSourceImport,type CommonSourcePayload} from './commonSourceBoundary'
import {commonSourceShape} from './commonSourceContract'
import {withGlOwnerCleanup} from './glOwnerCleanup'
import {compareStages} from './stages'
const sourceOptions={diagnosticWaterPolicy:'bottomless',diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticLandingPolicy:'fluid',diagnosticCanonicalSettleRadius:true,diagnosticSolventField:true,diagnosticPigmentRecord:true} as const
const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer)),v=>v.toString(16).padStart(2,'0')).join('')
const flip=(raw:Uint8Array,w:number,h:number)=>{const top=new Uint8Array(raw.length);for(let y=0;y<h;y++)top.set(raw.subarray((h-y-1)*w*4,(h-y)*w*4),y*w*4);return top}
async function fieldDigests(field:any,native:boolean){if(!field||field.w!==1536||field.h!==1536)throw Error('Actual1536 settle field required');const rows=[];for(const role of ['a','b','c','ca','cb','cc','coverage','mask','pressure','band']){const b=field[role];if(!b)throw Error('Missing final field '+role);const bytes=native?await b.readBytes():flip(b.readPixels(),b.width,b.height);rows.push({role,w:b.width,h:b.height,filter:b.filter??b._baseFilter,sha256:await hash(bytes)})}return rows}
export interface CommonSourceCheckpoint {code:string;operationSha256:string;paperSha256:string;payload:CommonSourcePayload;glBytes:Uint8Array;glFields:Awaited<ReturnType<typeof fieldDigests>>;gl:{error:number;lost:boolean};glOwnerRetired:true;config:{paperWorld:{w:number;h:number};paperScale:number;gradientFibres:boolean;supportsFilm:boolean;ab:Record<string,boolean>;plannerFlags:Record<string,boolean>}}
/** Source-only producer: returns CPU-owned bytes AFTER GL owner destruction. */
export async function prepareCommonSourceCheckpoint({operation,timeoutMs=300000}:{operation:StrokeOperation;timeoutMs?:number}):Promise<CommonSourceCheckpoint>{
 if(operation.tool!=='watercolor'||operation.preset!=='normal:100:100:PB29:round')throw Error('Original single100 source fixture only')
 const surface=document.querySelector('#surface')!;const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;surface.replaceChildren(canvas)
 let config:CommonSourceCheckpoint['config'];let payload:CommonSourcePayload;let glBytes:Uint8Array;let glFields:Awaited<ReturnType<typeof fieldDigests>>
 const gl=await withGlOwnerCleanup(()=>new PencilEngine(canvas,{paper:'fine',pageWidth:1024,pageHeight:1024,userId:'qa-native',joinedTouch:true,gradientFibres:true}),async engine=>{
  const e=engine as any;await engine.paperReady();for(const [key,value]of Object.entries(sourceOptions))if(e._ribbonPainter[key]!==value)throw Error('Actual GL source policy differs '+key)
  engine.setLocked(false);engine.setActiveLayer(operation.layerId);engine.setCompositeOrder([{id:operation.layerId,opacity:1}]);engine.appendOperation({id:'common-source-layer',type:'layer_add',userId:'qa-native',timestamp:1791400000000,layerId:operation.layerId,name:'Common source'},'remote')
  const context=e._settlePlan.ctx;config={paperWorld:{...context.paperWorldSize()},paperScale:e._paper.scale,gradientFibres:context.gradientFibres?.()??false,supportsFilm:context.supportsFilm(),ab:{...context.ab()},plannerFlags:Object.fromEntries(Object.entries(e._settlePlan).filter(([key,value])=>key.startsWith('diagnostic')&&typeof value==='boolean').map(([key,value])=>[key,value as boolean]))};if(!config.supportsFilm)throw Error('Common-source native requires actualGL MAX film support');const capture=captureActualGlSource(engine),deadline=performance.now()+timeoutMs
  try{engine.appendOperation(operation,'remote');let stable=0;while(stable<3){if(performance.now()>deadline)throw Error('Common-source GL timeout');if(e.gl.isContextLost())throw Error('GL lost');await new Promise(requestAnimationFrame);stable=e._settle||e._rebuildJobs.size||e._pendingRebuilds.size||e._unsettledLayers.size?0:stable+1}
   payload=capture.read();const tiles=e._layers.get(operation.layerId).allResident();if(tiles.length!==1||tiles[0].originX!==0||tiles[0].originY!==0)throw Error('Actual GL output is not one bounded tile');glBytes=flip(tiles[0].buffer.readPixels(),1024,1024);glFields=await fieldDigests(e._fieldCache[0],false);const error=e.gl.getError();if(error)throw Error('GL error '+error);return{error,lost:false}
  }finally{capture.destroy()}
 },()=>surface.replaceChildren())
 console.info('COMMON_SOURCE GL retired; actual payload bytes',payload!.physicalBytes)
 const la=await getPaperBytes('fine')
 return{code:'__SOURCE_CODE__',operationSha256:await hash(new TextEncoder().encode(JSON.stringify(operation))),paperSha256:await hash(la),payload:payload!,glBytes:glBytes!,glFields:glFields!,gl,glOwnerRetired:true,config:config!}
}
/** Separate arms reuse exact durable source without another GL job. */
export async function runCommonSourceSolver({operation,checkpoint,commonSource,producerCode}:{operation:StrokeOperation;checkpoint:CommonSourceCheckpoint;commonSource:boolean;producerCode?:string}){
 if(!/^[a-f0-9]{40}$/.test(checkpoint.code)||checkpoint.code!==(producerCode??'__SOURCE_CODE__')||checkpoint.operationSha256!==await hash(new TextEncoder().encode(JSON.stringify(operation)))||!checkpoint.glOwnerRetired)throw Error('Immutable common-source provenance differs')
 const la=await getPaperBytes('fine');if(await hash(la)!==checkpoint.paperSha256)throw Error('Actual paper differs')
 const {payload,glBytes,glFields,gl}=checkpoint,surface=document.querySelector('#surface')!,side=Math.sqrt(la.length/2),paper=new Uint8Array(side*side*4);for(let i=0;i<la.length/2;i++){paper[i*4]=paper[i*4+1]=paper[i*4+2]=la[i*2];paper[i*4+3]=la[i*2+1]}
 const manifest=await Promise.all(payload!.fields.map(async f=>({...f,bytes:undefined,sha256:f.bytes?await hash(f.bytes):null}))),arms=[]
 {
  console.info('COMMON_SOURCE native arm starting',commonSource)
  const c=document.createElement('canvas');surface.replaceChildren(c);const backend=await CanonicalWatercolorWebGpu.create({canvas:c,width:1024,height:1024,roomOwnedResources:true,paper:{bytes:paper,width:side,height:side,origin:[0,0],texSize:[checkpoint.config.paperWorld.w,checkpoint.config.paperWorld.h],scale:checkpoint.config.paperScale}}),errors:string[]=[]
  backend.device.addEventListener('uncapturederror',e=>errors.push(e.error.message));let lost=false;void backend.device.lost.then(x=>{if(x.reason!=='destroyed')lost=true})
  let runner:CanonicalBoundedSceneRunner|undefined,control:ReturnType<typeof installCommonSourceImport>|null=null
  try{
  runner=new CanonicalBoundedSceneRunner(backend,{sourceOptions,now:()=>operation.timestamp-1791400000000,timestamp:()=>operation.timestamp,operationId:()=>{throw Error('Replay must preserve identity')}});const planner=(runner as any).planner;planner.ctx.gradientFibres=()=>checkpoint.config.gradientFibres;planner.ctx.ab=()=>({...checkpoint.config.ab});for(const [key,value]of Object.entries(checkpoint.config.plannerFlags)){if(typeof planner[key]!=='boolean')throw Error('Native planner flag missing '+key);planner[key]=value}control=commonSource?installCommonSourceImport(runner,payload!):null
   backend.device.pushErrorScope('validation');runner.replay(operation);await runner.drain();const bytes=await runner.target.buffer.readBytes(),fields=await fieldDigests((runner.fieldOwner as any).current,true),validation=(await backend.device.popErrorScope())?.message??null
   console.info('COMMON_SOURCE native arm complete',commonSource)
   arms.push({commonSource,sha256:await hash(bytes),comparisonVsGl:compareStages([{key:'material',w:1024,h:1024,bytes}],[{key:'material',w:1024,h:1024,bytes:glBytes!}])[0],fields,importCalls:control?.calls??0,uploadedBytes:control?.uploadedBytes??0,errors,lost,validation})
  }finally{control?.detach();try{await runner?.retire();await backend.device.queue.onSubmittedWorkDone().catch(()=>{})}finally{backend.destroy();surface.replaceChildren()}}
 }
 return{code:'__SOURCE_CODE__',producerCode:checkpoint.code,operationSha256:await hash(new TextEncoder().encode(JSON.stringify(operation))),paperSha256:await hash(la),config:checkpoint.config,sourceManifest:manifest,sourcePhysicalBytes:payload!.physicalBytes,sourceMetadata:payload!.metadataJson,sourceScalars:payload!.scalarsJson,gl:{...gl,sha256:await hash(glBytes!),fields:glFields!},arms,limits:'One original100 operation; actualGL source ALL17named roles+target, strict null/alias/filter/film/CPUrequest check before native import; native source CPU delivery still runs once. Sequential owners, actual1536 solver. Diagnostic only; no Room/multiwash/performance claim.'}
}
/** Topology-only consumer: stops before planner ops/import, never claims solver equality.
 * Producer and consumer passports are intentionally separate and both returned. */
export async function inspectCommonSourceShape({operation,checkpoint}:{operation:StrokeOperation;checkpoint:CommonSourceCheckpoint}){
 if(!/^[a-f0-9]{40}$/.test(checkpoint.code)||checkpoint.operationSha256!==await hash(new TextEncoder().encode(JSON.stringify(operation)))||!checkpoint.glOwnerRetired)throw Error('Invalid immutable producer checkpoint')
 const la=await getPaperBytes('fine');if(await hash(la)!==checkpoint.paperSha256)throw Error('Paper differs');const side=Math.sqrt(la.length/2),paper=new Uint8Array(side*side*4);for(let i=0;i<la.length/2;i++){paper[i*4]=paper[i*4+1]=paper[i*4+2]=la[i*2];paper[i*4+3]=la[i*2+1]}
 const canvas=document.createElement('canvas'),backend=await CanonicalWatercolorWebGpu.create({canvas,width:1024,height:1024,roomOwnedResources:true,paper:{bytes:paper,width:side,height:side,origin:[0,0],texSize:[checkpoint.config.paperWorld.w,checkpoint.config.paperWorld.h],scale:checkpoint.config.paperScale}})
 let runner:CanonicalBoundedSceneRunner|undefined;let actual:unknown=null,calls=0
 try{runner=new CanonicalBoundedSceneRunner(backend,{sourceOptions,now:()=>operation.timestamp-1791400000000,timestamp:()=>operation.timestamp,operationId:()=>{throw Error('Preserve operation')}});const planner=(runner as any).planner;planner.ctx.gradientFibres=()=>checkpoint.config.gradientFibres;planner.ctx.ab=()=>({...checkpoint.config.ab});planner.prepare=(...args:any[])=>{calls++;const target=args[1][0].buffer,entry=args[0].peek(target);actual=commonSourceShape(entry,target);return null};runner.replay(operation);await runner.drain();if(calls!==1)throw Error('Unexpected prepare count');return{code:'__SOURCE_CODE__',producerCode:checkpoint.code,calls,expected:{...checkpoint.payload,fields:checkpoint.payload.fields.map(({bytes:_bytes,...f})=>f)},actual,scope:'Source topology only; no import and no solver ops or final quality claim'}}finally{try{await runner?.retire()}finally{backend.destroy()}}
}

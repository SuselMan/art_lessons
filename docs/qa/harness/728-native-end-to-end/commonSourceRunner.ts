import type {StrokeOperation} from '@grafetto/shared'
import {PencilEngine} from '../../../../apps/web/src/engine/index'
import {getPaperBytes} from '../../../../apps/web/src/engine/src/paper/paperLoader'
import {CanonicalWatercolorWebGpu} from '../../../../apps/web/src/engine/src/webgpuCanonical/backend'
import {CanonicalBoundedSceneRunner} from '../../../../apps/web/src/engine/src/webgpuCanonical/boundedSceneRunner'
import {captureActualGlSource,installCommonSourceImport,type CommonSourcePayload} from './commonSourceBoundary'
import {withGlOwnerCleanup} from './glOwnerCleanup'
import {compareStages} from './stages'
const sourceOptions={diagnosticWaterPolicy:'bottomless',diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticLandingPolicy:'fluid',diagnosticCanonicalSettleRadius:true,diagnosticSolventField:true,diagnosticPigmentRecord:true} as const
const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer)),v=>v.toString(16).padStart(2,'0')).join('')
const flip=(raw:Uint8Array,w:number,h:number)=>{const top=new Uint8Array(raw.length);for(let y=0;y<h;y++)top.set(raw.subarray((h-y-1)*w*4,(h-y)*w*4),y*w*4);return top}
async function fieldDigests(field:any,native:boolean){if(!field||field.w!==1536||field.h!==1536)throw Error('Actual1536 settle field required');const rows=[];for(const role of ['a','b','c','ca','cb','cc','coverage','mask','pressure','band']){const b=field[role];if(!b)throw Error('Missing final field '+role);const bytes=native?await b.readBytes():flip(b.readPixels(),b.width,b.height);rows.push({role,w:b.width,h:b.height,filter:b.filter??b._baseFilter,sha256:await hash(bytes)})}return rows}
/** Sequential owners. Source capture is complete before native GPU allocation. */
export async function runCommonSourceSolver({operation,timeoutMs=300000}:{operation:StrokeOperation;timeoutMs?:number}){
 if(operation.tool!=='watercolor'||operation.preset!=='normal:100:100:PB29:round')throw Error('Original single100 source fixture only')
 const surface=document.querySelector('#surface')!;const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;surface.replaceChildren(canvas)
 let payload:CommonSourcePayload;let glBytes:Uint8Array;let glFields:Awaited<ReturnType<typeof fieldDigests>>
 const gl=await withGlOwnerCleanup(()=>new PencilEngine(canvas,{paper:'fine',pageWidth:1024,pageHeight:1024,userId:'qa-native',joinedTouch:true,gradientFibres:true}),async engine=>{
  const e=engine as any;await engine.paperReady();for(const [key,value]of Object.entries(sourceOptions))if(e._ribbonPainter[key]!==value)throw Error('Actual GL source policy differs '+key)
  engine.setLocked(false);engine.setActiveLayer(operation.layerId);engine.setCompositeOrder([{id:operation.layerId,opacity:1}]);engine.appendOperation({id:'common-source-layer',type:'layer_add',userId:'qa-native',timestamp:1791400000000,layerId:operation.layerId,name:'Common source'},'remote')
  const capture=captureActualGlSource(engine),deadline=performance.now()+timeoutMs
  try{engine.appendOperation(operation,'remote');let stable=0;while(stable<3){if(performance.now()>deadline)throw Error('Common-source GL timeout');if(e.gl.isContextLost())throw Error('GL lost');await new Promise(requestAnimationFrame);stable=e._settle||e._rebuildJobs.size||e._pendingRebuilds.size||e._unsettledLayers.size?0:stable+1}
   payload=capture.read();const tiles=e._layers.get(operation.layerId).allResident();if(tiles.length!==1||tiles[0].originX!==0||tiles[0].originY!==0)throw Error('Actual GL output is not one bounded tile');glBytes=flip(tiles[0].buffer.readPixels(),1024,1024);glFields=await fieldDigests(e._fieldCache[0],false);const error=e.gl.getError();if(error)throw Error('GL error '+error);return{error,lost:false}
  }finally{capture.destroy()}
 },()=>surface.replaceChildren())
 console.info('COMMON_SOURCE GL retired; actual payload bytes',payload!.physicalBytes)
 const la=await getPaperBytes('fine'),side=Math.sqrt(la.length/2),paper=new Uint8Array(side*side*4);for(let i=0;i<la.length/2;i++){paper[i*4]=paper[i*4+1]=paper[i*4+2]=la[i*2];paper[i*4+3]=la[i*2+1]}
 const manifest=await Promise.all(payload!.fields.map(async f=>({...f,bytes:undefined,sha256:f.bytes?await hash(f.bytes):null}))),arms=[]
 for(const commonSource of [false,true]){
  console.info('COMMON_SOURCE native arm starting',commonSource)
  const c=document.createElement('canvas');surface.replaceChildren(c);const backend=await CanonicalWatercolorWebGpu.create({canvas:c,width:1024,height:1024,roomOwnedResources:true,paper:{bytes:paper,width:side,height:side,origin:[0,0],texSize:[1024,1024],scale:1}}),errors:string[]=[]
  backend.device.addEventListener('uncapturederror',e=>errors.push(e.error.message));let lost=false;void backend.device.lost.then(x=>{if(x.reason!=='destroyed')lost=true})
  const runner=new CanonicalBoundedSceneRunner(backend,{sourceOptions,now:()=>operation.timestamp-1791400000000,timestamp:()=>operation.timestamp,operationId:()=>{throw Error('Replay must preserve identity')}}),control=commonSource?installCommonSourceImport(runner,payload!):null
  try{backend.device.pushErrorScope('validation');runner.replay(operation);await runner.drain();const bytes=await runner.target.buffer.readBytes(),fields=await fieldDigests((runner.fieldOwner as any).current,true),validation=(await backend.device.popErrorScope())?.message??null
   console.info('COMMON_SOURCE native arm complete',commonSource)
   arms.push({commonSource,sha256:await hash(bytes),comparisonVsGl:compareStages([{key:'material',w:1024,h:1024,bytes}],[{key:'material',w:1024,h:1024,bytes:glBytes!}])[0],fields,importCalls:control?.calls??0,uploadedBytes:control?.uploadedBytes??0,errors,lost,validation})
  }finally{control?.detach();await runner.drain();runner.destroy();backend.destroy();surface.replaceChildren()}
 }
 return{code:'__SOURCE_CODE__',operationSha256:await hash(new TextEncoder().encode(JSON.stringify(operation))),paperSha256:await hash(la),sourceManifest:manifest,sourcePhysicalBytes:payload!.physicalBytes,sourceMetadata:payload!.metadataJson,sourceScalars:payload!.scalarsJson,gl:{...gl,sha256:await hash(glBytes!),fields:glFields!},arms,limits:'One original100 operation; actualGL source ALL17named roles+target, strict null/alias/filter/film/CPUrequest check before native import; native source CPU delivery still runs once. Sequential owners, actual1536 solver. Diagnostic only; no Room/multiwash/performance claim.'}
}

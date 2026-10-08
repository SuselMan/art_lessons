import {decodePreBrush68Checkpoint} from './preBrush68Codec'
import {PencilEngine} from '../../../../apps/web/src/engine/index'
import {getPaperBytes} from '../../../../apps/web/src/engine/src/paper/paperLoader'
import type {StrokeOperation} from '@grafetto/shared'
import type {CommonSourceCheckpoint} from './commonSourceRunner'
import {installPreBrush68Checkpoint} from './preBrush68Checkpoint'
import {withGlOwnerCleanup} from './glOwnerCleanup'
const hash=async(b:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b.slice().buffer)),v=>v.toString(16).padStart(2,'0')).join('')
const FLOW_SHA='3be5473ac4b1fbe38bc49c2ffc943126572e988416f5b9b3694cd6e511bee43b'
export async function runPreBrush68Producer({operation,checkpoint,timeoutMs=120000}:{operation:StrokeOperation;checkpoint:CommonSourceCheckpoint;timeoutMs?:number}){
 if(operation.tool!=='watercolor'||operation.preset!=='normal:100:100:PB29:round'||!checkpoint.glOwnerRetired||!/^[a-f0-9]{40}$/.test(checkpoint.code)||await hash(new TextEncoder().encode(JSON.stringify(operation)))!==checkpoint.operationSha256)throw Error('Original durable source passport required')
 if(await hash(await getPaperBytes('fine'))!==checkpoint.paperSha256||checkpoint.config.paperScale!==1||checkpoint.config.paperWorld.w!==1024||checkpoint.config.paperWorld.h!==1024)throw Error('Exact paper/frame required')
 const surface=document.querySelector('#surface')!,canvas=document.createElement('canvas');canvas.width=canvas.height=1024;surface.replaceChildren(canvas)
 let snapshot:ReturnType<ReturnType<typeof installPreBrush68Checkpoint>['read']>|undefined
 const status=await withGlOwnerCleanup(()=>new PencilEngine(canvas,{paper:'fine',pageWidth:1024,pageHeight:1024,userId:'qa-native',joinedTouch:true,gradientFibres:checkpoint.config.gradientFibres}),async engine=>{
  const e=engine as any;await engine.paperReady();engine.setLocked(false);engine.setActiveLayer(operation.layerId);engine.setCompositeOrder([{id:operation.layerId,opacity:1}]);engine.appendOperation({id:'prebrush-layer',type:'layer_add',userId:'qa-native',timestamp:1791400000000,layerId:operation.layerId,name:'Prebrush'},'remote')
  if(JSON.stringify(e._settlePlan.ctx.ab())!==JSON.stringify(checkpoint.config.ab)||e._settlePlan.ctx.supportsFilm()!==checkpoint.config.supportsFilm)throw Error('Actual GL physical flags differ')
  for(const [key,value]of Object.entries(checkpoint.config.plannerFlags))if(e._settlePlan[key]!==value)throw Error('Original planner flag differs '+key)
  const capture=installPreBrush68Checkpoint(engine,checkpoint.payload),deadline=performance.now()+timeoutMs
  try{engine.appendOperation(operation,'remote');let stable=0;while(stable<3){if(performance.now()>deadline)throw Error('Bounded prefix deadline');if(e.gl.isContextLost())throw Error('GL lost');await new Promise(requestAnimationFrame);stable=e._settle||e._rebuildJobs.size||e._pendingRebuilds.size||e._unsettledLayers.size?0:stable+1}snapshot=capture.read();const error=e.gl.getError();if(error)throw Error('GL error '+error);return{glError:error,lost:false}}finally{capture.detach()}
 },()=>surface.replaceChildren())
 if(!snapshot||await hash(snapshot.flow.bytes)!==FLOW_SHA)throw Error('Actual original flow checksum mismatch')
 let packedBytes=0;const pack=async(bytes:Uint8Array)=>{const gzip=new Uint8Array(await new Response(new Blob([bytes.slice().buffer]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());packedBytes+=gzip.length;if(packedBytes>8*1024*1024)throw Error('Compact checkpoint budget exceeded');let s='';for(let i=0;i<gzip.length;i+=32768)s+=String.fromCharCode(...gzip.subarray(i,i+32768));return{rawBytes:bytes.length,sha256:await hash(bytes),gzipSha256:await hash(gzip),gzipBase64:btoa(s)}}
 const rows=[];for(const {bytes,...row}of snapshot.rows)rows.push({...row,...await pack(bytes),nonzero:bytes.some(x=>x!==0)})
 const before= snapshot.rows.filter(x=>x.phase==='before'),after=snapshot.rows.filter(x=>x.phase==='after');const movement=before.map((b,i)=>{const a=after[i],channels=Array.from({length:4},()=>({changed:0,max:0,sum:0}));for(let k=0;k<b.bytes.length;k++){const d=Math.abs(b.bytes[k]-a.bytes[k]),c=channels[k%4];if(d)c.changed++;c.max=Math.max(c.max,d);c.sum+=d}return{role:b.role,channels}})
 const result={code:'__SOURCE_CODE__',producerCode:checkpoint.code,operationSha256:checkpoint.operationSha256,paperSha256:checkpoint.paperSha256,config:checkpoint.config,glOwnerRetired:true,...status,roi:snapshot.roi,rows,flow:{width:31,height:26,filter:'linear',...await pack(snapshot.flow.bytes)},brushCalls:snapshot.brushCalls,movement,packedBytes,scope:snapshot.scope};if(/^[a-f0-9]{40}$/.test(result.code))await decodePreBrush68Checkpoint(result);return result
}
/** Compressed durable handoff only; exact chunk guards run before GL allocation. */
export async function runPreBrush68Gate(input:{operation:StrokeOperation;packed:import('./commonSourceCheckpoint').PackedCommonSourceCheckpoint;chunks:Record<string,string>;producerCode:string}){
 if(!input||input.packed?.code!==input.producerCode||Object.keys(input.chunks??{}).length!==input.packed?.chunks.length||JSON.stringify(input).length>8*1024*1024)throw Error('Bounded durable prebrush input passport')
 const {restoreCommonSourceCheckpoint}=await import('./commonSourceCheckpoint')
 const checkpoint=await restoreCommonSourceCheckpoint(input.packed,async name=>{const s=input.chunks[name];if(typeof s!=='string'||s.length>Math.ceil(4198400/3)*4)throw Error('Exact compressed source chunk missing/bounds');return Uint8Array.from(atob(s),c=>c.charCodeAt(0))})
 return runPreBrush68Producer({operation:input.operation,checkpoint,timeoutMs:120000})
}

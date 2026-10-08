import { captureStages,compareStages,type Stage } from './stages'
import { PencilEngine } from '../../../../apps/web/src/engine/index'
import { getPaperBytes } from '../../../../apps/web/src/engine/src/paper/paperLoader'
import { CanonicalWatercolorWebGpu } from '../../../../apps/web/src/engine/src/webgpuCanonical/backend'
import { CanonicalBoundedSceneRunner } from '../../../../apps/web/src/engine/src/webgpuCanonical/boundedSceneRunner'
import type { Operation } from '@grafetto/shared'
import type { PointerData } from '../../../../apps/web/src/engine/src/input/PointerInput'
import type { WatercolorGestureSettings } from '../../../../apps/web/src/engine/src/input/CanonicalWatercolorGesture'
import type { ILayerBuffer } from '../../../../apps/web/src/engine/src/buffers/ILayerBuffer'
const fetchOriginal=window.fetch.bind(window)
window.fetch=((input:RequestInfo|URL,init?:RequestInit)=>fetchOriginal(typeof input==='string'&&input.startsWith('/paper/')?new URL('./paper/'+input.slice(7),location.href):input,init)) as typeof fetch
const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer)),v=>v.toString(16).padStart(2,'0')).join('')
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
const sourceOptions={diagnosticWaterPolicy:'bottomless',diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticLandingPolicy:'fluid',diagnosticCanonicalSettleRadius:true,diagnosticSolventField:true,diagnosticPigmentRecord:true} as const
function flip(bytes:Uint8Array,w:number,h:number){const out=new Uint8Array(bytes.length);for(let y=0;y<h;y++)out.set(bytes.subarray(y*w*4,(y+1)*w*4),(h-1-y)*w*4);return out}
function difference(a:Uint8Array,b:Uint8Array){let changed=0,max=0,sum=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);changed+=Number(d>0);max=Math.max(max,d);sum+=d}return{changed,max,mean:sum/a.length,exact:changed===0}}
export async function runEndToEnd({size=100,allowLarge=false,timeoutMs=600000,stages=false}:{size?:100|400;allowLarge?:boolean;timeoutMs?:number;stages?:boolean|'prediffuse'}={}){
 // Conservative soft policy, NOT available VRAM measurement. Full canonical1536 fields remain enabled.
 const memoryGiB=(navigator as Navigator&{deviceMemory?:number}).deviceMemory??null
 const estimatedPeakMiB=512
 if(size===400&&(!allowLarge||memoryGiB!==null&&memoryGiB<4))return{skipped:true,reason:'400 requires explicit allowLarge and >=4GiB reported system memory when available',memoryGiB,estimatedPeakMiB}
 const surface=document.querySelector('#surface')!;surface.replaceChildren()
 const canvas=document.createElement('canvas');surface.append(canvas)
 const la=await getPaperBytes('fine'),side=Math.sqrt(la.length/2)
 if(!Number.isInteger(side))throw new Error('Invalid baked paper LA dimensions')
 const paper=new Uint8Array(side*side*4);for(let i=0;i<la.length/2;i++)paper.set([la[i*2],la[i*2],la[i*2],la[i*2+1]],i*4)
 const backend=await CanonicalWatercolorWebGpu.create({canvas,width:1024,height:1024,paper:{bytes:paper,width:side,height:side,origin:[0,0],texSize:[1024,1024],scale:1}})
 const errors:string[]=[];backend.device.addEventListener('uncapturederror',event=>errors.push(event.error.message))
 let lost=false;void backend.device.lost.then(info=>{if(info.reason!=='destroyed')lost=true})
 const tape:Operation[]=[];let time=1000,index=0
 const runner=new CanonicalBoundedSceneRunner(backend,{sourceOptions,now:()=>time,timestamp:()=>1791400000000+time,operationId:()=>`fixed-operation-${index++}`,onLocalOperation:op=>tape.push(op)})
 let native:Uint8Array
 console.info('E2E native owner ready');const started=performance.now()
 try{
  const settings:WatercolorGestureSettings={tool:'watercolor',preset:'normal:100:100:PB29:round',size,opacity:1,color:[.2,.1,.5],nibAngle:{angle:0,anchor:'canvas'},tiltResponse:'smooth'}
  const pointer=(x:number,y:number,t:number):PointerData=>({x,y,pressure:.8,tiltX:0,tiltY:0,speed:.2,timeStamp:t,pointerType:'pen'})
  const draw=async(id:string,points:number[][],pigment:number)=>{
   const s={...settings,preset:`normal:100:${pigment}:PB29:round`};time+=100
   runner.begin(pointer(points[0][0],points[0][1],time),s,{strokeId:id,washId:'fixed-wash',layerId:'L',userId:'qa-native'})
   for(const [x,y] of points.slice(1)){time+=16;runner.move(pointer(x,y,time))}
   time+=16;runner.end(pointer(points.at(-1)![0],points.at(-1)![1],time));await runner.drain();console.info('E2E native stroke drained',id)
  }
  if(size===400){await draw('fixed-water',[[400,500],[500,500],[600,500]],0);await draw('fixed-pigment',[[440,500],[500,500],[560,500]],100)}
  else await draw('fixed-zigzag',[[300,350],[650,400],[300,450],[650,500],[300,550]],100)
  native=await runner.target.buffer.readBytes()
 }finally{await runner.drain();runner.destroy();backend.destroy();surface.replaceChildren()}
 console.info('E2E native readback complete');const nativeMs=performance.now()-started
 // Third fresh owner isolates event-batch delivery from authoritative packed replay.
 const originalTapeSha256=await hash(new TextEncoder().encode(JSON.stringify(tape)))
 const replayCanvas=document.createElement('canvas');surface.append(replayCanvas)
 const replayBackend=await CanonicalWatercolorWebGpu.create({canvas:replayCanvas,width:1024,height:1024,paper:{bytes:paper,width:side,height:side,origin:[0,0],texSize:[1024,1024],scale:1}})
 replayBackend.device.addEventListener('uncapturederror',event=>errors.push('nativeReplay: '+event.error.message))
 void replayBackend.device.lost.then(info=>{if(info.reason!=='destroyed')lost=true})
 let replayClock=1000
 const replayRunner=new CanonicalBoundedSceneRunner(replayBackend,{sourceOptions,now:()=>replayClock,timestamp:()=>1791400000000+replayClock,operationId:()=>{throw new Error('Replay must preserve original operation IDs')}})
 const nativeCapture=stages?captureStages(replayRunner,true,96*1024*1024,stages==='prediffuse'?'prediffuse':'basic'):null
 let nativeStages:Stage[]=[]
 let nativeReplay:Uint8Array
 const replayStarted=performance.now()
 try{
  for(const operation of tape){if(operation.type!=='stroke')throw new Error('Native tape contains unsupported control operation');replayClock=operation.timestamp-1791400000000;replayRunner.replay(operation);await replayRunner.drain();console.info('E2E native packed replay drained',operation.id)}
  nativeReplay=await replayRunner.target.buffer.readBytes();nativeStages=await nativeCapture?.read()??[]
 }finally{await replayRunner.drain();nativeCapture?.detach();nativeCapture?.destroy();replayRunner.destroy();replayBackend.destroy();surface.replaceChildren()}
 const nativeReplayMs=performance.now()-replayStarted
 const replayPreservedTape=originalTapeSha256===await hash(new TextEncoder().encode(JSON.stringify(tape)))
 // Sequential owners: no simultaneous native+nativeReplay+GL1536 allocation.
 const glCanvas=document.createElement('canvas');glCanvas.width=1024;glCanvas.height=1024;surface.append(glCanvas)
 const engine=new PencilEngine(glCanvas,{paper:'fine',pageWidth:1024,pageHeight:1024,userId:'qa-native',joinedTouch:true,gradientFibres:true})
 const probe=engine as unknown as {_ribbonPainter:Record<string,unknown>;gl:WebGLRenderingContext;_settle:unknown;_rebuildJobs:Map<string,unknown>;_pendingRebuilds:Set<string>;_unsettledLayers:Set<string>;_layers:Map<string,ILayerBuffer>}
 const glCapture=stages?captureStages(engine,false,96*1024*1024,stages==='prediffuse'?'prediffuse':'basic'):null
 let glStages:Stage[]=[]
 const wait=async()=>{let stable=0;const deadline=performance.now()+timeoutMs;while(stable<3){if(performance.now()>deadline)throw new Error('Full1536 GL settle timeout');if(probe.gl.isContextLost())throw new Error('GL context lost');await frame();stable=probe._settle||probe._rebuildJobs.size||probe._pendingRebuilds.size||probe._unsettledLayers.size?0:stable+1}}
 let legacy=new Uint8Array(1024*1024*4),renderer:string|null=null,glError=0
 const glStarted=performance.now()
 try{
  await engine.paperReady();for(const [key,value] of Object.entries(sourceOptions)){if(probe._ribbonPainter[key]!==value)throw new Error(`Source policy mismatch: ${key}`)};engine.setLocked(false);engine.setActiveLayer('L');engine.setCompositeOrder([{id:'L',opacity:1}])
  engine.appendOperation({id:'fixed-layer',type:'layer_add',userId:'qa-native',timestamp:1791400000000,layerId:'L',name:'Parity'},'remote');await wait()
  for(const operation of tape){engine.appendOperation(operation,'remote');await wait();console.info('E2E legacy stroke drained',operation.id)}
  const tiles=probe._layers.get('L')!.allResident();for(const tile of tiles){const bytes=flip(tile.buffer.readPixels(),tile.buffer.width,tile.buffer.height);for(let y=0;y<tile.buffer.height;y++){const yy=tile.originY+y;if(yy<0||yy>=1024)continue;const x=Math.max(0,tile.originX),end=Math.min(1024,tile.originX+tile.buffer.width);if(end>x)legacy.set(bytes.subarray((y*tile.buffer.width+x-tile.originX)*4,(y*tile.buffer.width+end-tile.originX)*4),(yy*1024+x)*4)}}
  glStages=await glCapture?.read()??[]
  const ext=probe.gl.getExtension('WEBGL_debug_renderer_info');renderer=ext?String(probe.gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)):null;glError=probe.gl.getError()
 }finally{glCapture?.detach();glCapture?.destroy();engine.destroy();surface.replaceChildren()}
 return{code:'__CODE__',size,stageComparison:stages?compareStages(nativeStages,glStages):null,stageMetadata:stages?{native:nativeCapture?.metadata,gl:glCapture?.metadata,nativePrimitives:nativeCapture?.primitiveMetadata,glPrimitives:glCapture?.primitiveMetadata,nativeChronology:nativeCapture?.chronology,glChronology:glCapture?.chronology}:null,memoryGiB,estimatedPeakMiB,nativeMs,nativeReplayMs,replayPreservedTape,nativeReplaySha256:await hash(nativeReplay!),authorVsNativeReplay:difference(native!,nativeReplay!),nativeReplayVsLegacy:difference(nativeReplay!,legacy),nativeReplayNonzero:nativeReplay!.some(x=>x!==0),legacyMs:performance.now()-glStarted,renderer,software:/swiftshader|llvmpipe/i.test(renderer??''),tape,tapeSha256:await hash(new TextEncoder().encode(JSON.stringify(tape))),paperSha256:await hash(la),nativeSha256:await hash(native!),legacySha256:await hash(legacy),wholeLayer:difference(native!,legacy),nativeNonzero:native!.some(x=>x!==0),legacyNonzero:legacy.some(x=>x!==0),errors,lost,glError,limitations:['Single1024 tile/layer/wash; serial settle; no Room/server/concurrency claim','Software difference is an observation, not hardware exactness','Final whole material layer; no claim of all transient fields parity','Native pointer event batches vs authoritative GL packed operation replay; batch-boundary discrepancy is detectable']}
}
Object.assign(window,{runEndToEnd})

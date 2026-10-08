import {runCommonSourceSolver} from './commonSourceRunner'
import {sourceContribution} from './sourceContribution'
import {replaySourceCoverage} from './sourceReplay'
import {sourceCommandManifest} from './sourceManifest'
import {diffuseHeightOracle} from './diffuseHeightOracle'
import { withGlOwnerCleanup } from './glOwnerCleanup'
import { installProductionGlNoisePatch } from './productionGlNoisePatch'
import type { ConsistentNoiseVariant } from './consistentNoise'
import { coveragePrimitiveOracle,coverageSequenceOracle } from './coverageOracle'
import type { CanonicalDrawCommand } from '../../../../apps/web/src/engine/src/dabs/canonicalStrokeChunk'
import { sameInputFrontOracle } from './frontOracle'
import type { CanonicalSourcePhaseExecutor } from '../../../../apps/web/src/engine/src/webgpuCanonical/sourcePhaseExecutor'
import { captureStages,compareStages,pressureCopyInvariant,correlateMode11,type Stage } from './stages'
import {prepareCanonicalWetOverlay} from '../../../../apps/web/src/engine/src/webgpuCanonical/wetOverlay'
import type {WetPresentationSnapshot} from '../728-native-wet-presentation/run'
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
function configureDiagnosticSampling(runner:CanonicalBoundedSceneRunner,enabled:boolean,captured?:CanonicalDrawCommand[],allCoverage=false){
 runner.adapter.diagnosticHardwareLinearInputs=enabled
 // Keep landing/source commands on the frozen baseline. This private seam is diagnostic only.
 const source=(runner as unknown as {source:CanonicalSourcePhaseExecutor}).source
 const execute=source.execute.bind(source)
 source.execute=(...args:Parameters<CanonicalSourcePhaseExecutor['execute']>)=>{
  if(captured)for(const command of args[1].commands)if(command.phase==='coverage'&&(allCoverage||!captured.some(v=>v.kind===command.kind))){if(captured.length>=200)throw new Error('Coverage command diagnostic exceeds 200 ordered primitives');captured.push(structuredClone(command))}
  const previous=runner.adapter.diagnosticHardwareLinearInputs
  runner.adapter.diagnosticHardwareLinearInputs=false
  try{return execute(...args)}finally{runner.adapter.diagnosticHardwareLinearInputs=previous}
 }
}

function layerPng(bytes:Uint8Array){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024
 const straight=new Uint8ClampedArray(bytes.length)
 for(let i=0;i<bytes.length;i+=4){const a=bytes[i+3];straight[i+3]=a;for(let c=0;c<3;c++)straight[i+c]=a?Math.min(255,Math.round(bytes[i+c]*255/a)):0}
 canvas.getContext('2d')!.putImageData(new ImageData(straight,1024,1024),0,0);return canvas.toDataURL('image/png')
}
function diffPng(a:Uint8Array,b:Uint8Array){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;const pixels=new Uint8ClampedArray(a.length)
 for(let i=0;i<a.length;i+=4){let d=0;for(let c=0;c<4;c++)d=Math.max(d,Math.abs(a[i+c]-b[i+c]));pixels[i]=Math.min(255,d*8);pixels[i+1]=0;pixels[i+2]=0;pixels[i+3]=255}
 canvas.getContext('2d')!.putImageData(new ImageData(pixels,1024,1024),0,0);return canvas.toDataURL('image/png')
}
export async function runEndToEnd({size=100,allowLarge=false,timeoutMs=600000,diagnosticSourceLiveSubmission=false,submissionMetrics=false,stages=false,suppliedTape,exportImages=false,diagnosticHardwareLinearInputs=false,frontIndex=1,sameInputFront=false,coveragePrimitives=false,exportWetSnapshots=false,coverageSequence=false,coverageSameInputIndices,coverageStampDebug=false,diagnosticLazyFrontClimb=false,lazyFrontOracle=false,diagnosticGlConsistentNoise,diagnosticStaticFrontCache=false,staticFrontOracle=false,diagnosticProductionGlConsistentNoise,diagnosticStaticDiffuseHeight=false,staticDiffuseOracle=false,coverageBlankSelected=false,diagnosticLiteralStampVertex=false,diagnosticCpuStampTrig=false,diagnosticFrontSourceFilter}:{size?:100|400;allowLarge?:boolean;timeoutMs?:number;diagnosticSourceLiveSubmission?:boolean;submissionMetrics?:boolean;stages?:boolean|'prediffuse'|'coverage'|'pressure';suppliedTape?:readonly Operation[];exportImages?:boolean;diagnosticHardwareLinearInputs?:boolean;frontIndex?:number;sameInputFront?:boolean;coveragePrimitives?:boolean;exportWetSnapshots?:boolean;coverageSequence?:boolean;coverageSameInputIndices?:readonly number[];coverageStampDebug?:boolean;diagnosticLazyFrontClimb?:boolean;lazyFrontOracle?:boolean;diagnosticGlConsistentNoise?:ConsistentNoiseVariant;diagnosticStaticFrontCache?:boolean;staticFrontOracle?:boolean;diagnosticProductionGlConsistentNoise?:ConsistentNoiseVariant;diagnosticStaticDiffuseHeight?:boolean;staticDiffuseOracle?:boolean;coverageBlankSelected?:boolean;diagnosticLiteralStampVertex?:boolean;diagnosticCpuStampTrig?:boolean;diagnosticFrontSourceFilter?:'manual'|'hardware'}={}){

 const tape:Operation[]=suppliedTape?structuredClone([...suppliedTape]):[];
 const layerId=tape.find(op=>op.type==='stroke')?.layerId??'L';
 if(suppliedTape&&(!tape.length||tape.some(op=>op.type!=='stroke'||op.tool!=='watercolor'||op.layerId!==layerId)))throw new Error('Captured comparison supports one nonempty watercolor layer only')
 // Conservative soft policy, NOT available VRAM measurement. Full canonical1536 fields remain enabled.
 const memoryGiB=(navigator as Navigator&{deviceMemory?:number}).deviceMemory??null
 const estimatedPeakMiB=512
 if(size===400&&(!allowLarge||memoryGiB!==null&&memoryGiB<4))return{code:'__CODE__',skipped:true,reason:'400 requires explicit allowLarge and >=4GiB reported system memory when available',memoryGiB,estimatedPeakMiB}
 const surface=document.querySelector('#surface')!;surface.replaceChildren()
 const canvas=document.createElement('canvas');surface.append(canvas)
 const la=await getPaperBytes('fine'),side=Math.sqrt(la.length/2)
 if(!Number.isInteger(side))throw new Error('Invalid baked paper LA dimensions')
 const paper=new Uint8Array(side*side*4);for(let i=0;i<la.length/2;i++)paper.set([la[i*2],la[i*2],la[i*2],la[i*2+1]],i*4)
 const backend=await CanonicalWatercolorWebGpu.create({canvas,width:1024,height:1024,paper:{bytes:paper,width:side,height:side,origin:[0,0],texSize:[1024,1024],scale:1}})
 const errors:string[]=[];backend.device.addEventListener('uncapturederror',event=>errors.push(event.error.message))
 let lost=false;void backend.device.lost.then(info=>{if(info.reason!=='destroyed')lost=true})
 let time=1000,index=0
 const runner=new CanonicalBoundedSceneRunner(backend,{sourceOptions,diagnosticSourceLiveSubmission,now:()=>time,timestamp:()=>1791400000000+time,operationId:()=>`fixed-operation-${index++}`,onLocalOperation:op=>tape.push(op)})
 runner.adapter.diagnosticCountSubmissions=submissionMetrics
 const capturedCoverage:CanonicalDrawCommand[]=[]
 runner.adapter.diagnosticStaticDiffuseHeight=diagnosticStaticDiffuseHeight
 runner.adapter.diagnosticStaticFrontCache=diagnosticStaticFrontCache
 runner.adapter.diagnosticLazyFrontClimb=diagnosticLazyFrontClimb
 configureDiagnosticSampling(runner,diagnosticHardwareLinearInputs,(coveragePrimitives||coverageSequence)?capturedCoverage:undefined,coverageSequence)
 const wetSnapshots:WetPresentationSnapshot[]=[]
 const b64=(bytes:Uint8Array)=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text)}
 const crop=(bytes:Uint8Array)=>{const out=new Uint8Array(128*128*4);for(let y=0;y<128;y++)out.set(bytes.subarray(((y+480)*1024+448)*4,((y+480)*1024+576)*4),y*128*4);return out}
 const captureWet=async(operationId:string)=>{const entry=runner.scratch.tiles.peek(runner.target.buffer);if(!entry)throw new Error('Missing captured coverage');const map=prepareCanonicalWetOverlay([runner.paperWet],time);wetSnapshots.push({operationId,origin:[448,480],width:128,height:128,layerRgbaB64:b64(crop(await runner.target.buffer.readBytes())),coverageRgbaB64:b64(crop(await entry.coverage.readBytes())),wet:map?{w:map.w,h:map.h,rect:map.rect,rgbaB64:b64(map.rgba)}:null,clock:time})}
 let nativeFrontCacheCounters:unknown=null,replayFrontCacheCounters:unknown=null
 let nativeComputeMs=0,nativeReplayComputeMs=0
 let nativeSubmissions:unknown=null,nativeReplaySubmissions:unknown=null
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
  if(suppliedTape){for(const operation of tape){if(operation.type!=='stroke')throw new Error('Only stroke tape supported');time=operation.timestamp-1791400000000;runner.replay(operation);await runner.drain();if(exportWetSnapshots)await captureWet(operation.id);console.info('E2E supplied native stroke drained',operation.id)}}
  else if(size===400){await draw('fixed-water',[[400,500],[500,500],[600,500]],0);await draw('fixed-pigment',[[440,500],[500,500],[560,500]],100)}
  else await draw('fixed-zigzag',[[300,350],[650,400],[300,450],[650,500],[300,550]],100)
  nativeComputeMs=performance.now()-started;nativeSubmissions=submissionMetrics?runner.adapter.submissionCounters:null
  native=await runner.target.buffer.readBytes();nativeFrontCacheCounters=runner.adapter.staticFrontCacheCounters
 }finally{await runner.drain();runner.destroy();backend.destroy();surface.replaceChildren()}
 console.info('E2E native readback complete');const nativeMs=performance.now()-started
 // Third fresh owner isolates event-batch delivery from authoritative packed replay.
 const originalTapeSha256=await hash(new TextEncoder().encode(JSON.stringify(tape)))
 const replayCanvas=document.createElement('canvas');surface.append(replayCanvas)
 const replayBackend=await CanonicalWatercolorWebGpu.create({canvas:replayCanvas,width:1024,height:1024,paper:{bytes:paper,width:side,height:side,origin:[0,0],texSize:[1024,1024],scale:1}})
 replayBackend.device.addEventListener('uncapturederror',event=>errors.push('nativeReplay: '+event.error.message))
 void replayBackend.device.lost.then(info=>{if(info.reason!=='destroyed')lost=true})
 let replayClock=1000
 const replayRunner=new CanonicalBoundedSceneRunner(replayBackend,{sourceOptions,diagnosticSourceLiveSubmission,now:()=>replayClock,timestamp:()=>1791400000000+replayClock,operationId:()=>{throw new Error('Replay must preserve original operation IDs')}})
 replayRunner.adapter.diagnosticCountSubmissions=submissionMetrics
 replayRunner.adapter.diagnosticStaticDiffuseHeight=diagnosticStaticDiffuseHeight
 replayRunner.adapter.diagnosticStaticFrontCache=diagnosticStaticFrontCache
 replayRunner.adapter.diagnosticLazyFrontClimb=diagnosticLazyFrontClimb
 configureDiagnosticSampling(replayRunner,diagnosticHardwareLinearInputs)
 const nativeCapture=stages?captureStages(replayRunner,true,96*1024*1024,stages==='pressure'?'pressure':stages==='coverage'?'coverage':stages==='prediffuse'?'prediffuse':'basic',frontIndex):null
 let nativeStages:Stage[]=[]
 let nativeReplay:Uint8Array
 const replayStarted=performance.now()
 try{
  for(const operation of tape){if(operation.type!=='stroke')throw new Error('Native tape contains unsupported control operation');replayClock=operation.timestamp-1791400000000;replayRunner.replay(operation);await replayRunner.drain();console.info('E2E native packed replay drained',operation.id)}
  nativeReplayComputeMs=performance.now()-replayStarted;nativeReplaySubmissions=submissionMetrics?replayRunner.adapter.submissionCounters:null
  nativeReplay=await replayRunner.target.buffer.readBytes();replayFrontCacheCounters=replayRunner.adapter.staticFrontCacheCounters;nativeStages=await nativeCapture?.read()??[]
 }finally{await replayRunner.drain();nativeCapture?.detach();nativeCapture?.destroy();replayRunner.destroy();replayBackend.destroy();surface.replaceChildren()}
 const nativeReplayMs=performance.now()-replayStarted
 const replayPreservedTape=originalTapeSha256===await hash(new TextEncoder().encode(JSON.stringify(tape)))
 // Sequential owners: no simultaneous native+nativeReplay+GL1536 allocation.
 const replayLegacy=async(variant?:ConsistentNoiseVariant)=>{
 const glCanvas=document.createElement('canvas');glCanvas.width=1024;glCanvas.height=1024;surface.append(glCanvas)
 const shaderPatch=installProductionGlNoisePatch(glCanvas,variant)
 return withGlOwnerCleanup(()=>new PencilEngine(glCanvas,{paper:'fine',pageWidth:1024,pageHeight:1024,userId:'qa-native',joinedTouch:true,gradientFibres:true}),async engine=>{
 const probe=engine as unknown as {_ribbonPainter:Record<string,unknown>;_ribbonPasses:Record<string,(...args:unknown[])=>unknown>;gl:WebGLRenderingContext;_settle:unknown;_rebuildJobs:Map<string,unknown>;_pendingRebuilds:Set<string>;_unsettledLayers:Set<string>;_layers:Map<string,ILayerBuffer>}
 const actualGlDither:Array<{method:string;phase:unknown;enabled:boolean}>=[]
 if(coveragePrimitives||coverageSequence)for(const name of ['drawRibbonNibPass','drawRibbonBands']){
  const owner=probe._ribbonPasses,original=owner[name]
  owner[name]=function(...args:unknown[]){const phase=args[name==='drawRibbonBands'?3:5];if(actualGlDither.length<200)actualGlDither.push({method:name,phase,enabled:probe.gl.isEnabled(probe.gl.DITHER)});return original.apply(this,args)}
 }
 const glCapture=stages?captureStages(engine,false,96*1024*1024,stages==='pressure'?'pressure':stages==='coverage'?'coverage':stages==='prediffuse'?'prediffuse':'basic',frontIndex):null
 let glStages:Stage[]=[],frontExpected:Stage|undefined
 const wait=async()=>{let stable=0;const deadline=performance.now()+timeoutMs;while(stable<3){if(performance.now()>deadline)throw new Error('Full1536 GL settle timeout');if(probe.gl.isContextLost())throw new Error('GL context lost');await frame();stable=probe._settle||probe._rebuildJobs.size||probe._pendingRebuilds.size||probe._unsettledLayers.size?0:stable+1}}
 let legacy=new Uint8Array(1024*1024*4),renderer:string|null=null,glError=0
 const glStarted=performance.now()
 try{
  await engine.paperReady();for(const [key,value] of Object.entries(sourceOptions)){if(probe._ribbonPainter[key]!==value)throw new Error(`Source policy mismatch: ${key}`)};engine.setLocked(false);engine.setActiveLayer(layerId);engine.setCompositeOrder([{id:layerId,opacity:1}])
  engine.appendOperation({id:'fixed-layer',type:'layer_add',userId:'qa-native',timestamp:1791400000000,layerId,name:'Parity'},'remote');await wait()
  for(const operation of tape){engine.appendOperation(operation,'remote');await wait();console.info('E2E legacy stroke drained',operation.id)}
  const tiles=probe._layers.get(layerId)!.allResident();for(const tile of tiles){const bytes=flip(tile.buffer.readPixels(),tile.buffer.width,tile.buffer.height);for(let y=0;y<tile.buffer.height;y++){const yy=tile.originY+y;if(yy<0||yy>=1024)continue;const x=Math.max(0,tile.originX),end=Math.min(1024,tile.originX+tile.buffer.width);if(end>x)legacy.set(bytes.subarray((y*tile.buffer.width+x-tile.originX)*4,(y*tile.buffer.width+end-tile.originX)*4),(yy*1024+x)*4)}}
  glStages=await glCapture?.read()??[]
  if(sameInputFront){if(stages!=='pressure'||frontIndex<1)throw new Error('Same-input front requires pressure probe and positive index');glCapture!.detach();frontExpected=glCapture!.replayFrontGl()}
  const ext=probe.gl.getExtension('WEBGL_debug_renderer_info');renderer=ext?String(probe.gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)):null;glError=probe.gl.getError()
 }finally{try{glCapture?.detach()}finally{glCapture?.destroy()}}
 const shaderReport=await shaderPatch.report();if(variant&&!shaderReport.changedPrograms)throw new Error('GL diagnostic patched no noise programs')
 return{legacy,renderer,glError,glCapture,glStages,frontExpected,actualGlDither,shaderReport,legacyMs:performance.now()-glStarted}
 },()=>{try{surface.replaceChildren()}finally{shaderPatch.restore()}})
 }
 const baselineGl=await replayLegacy()
 const {legacy,renderer,glError,glCapture,glStages,frontExpected,actualGlDither}=baselineGl
 const correctedGl=diagnosticProductionGlConsistentNoise?await replayLegacy(diagnosticProductionGlConsistentNoise):null
 const productionGlDiagnostic=correctedGl?{variant:diagnosticProductionGlConsistentNoise,shaderReport:correctedGl.shaderReport,baselineGlSha256:await hash(legacy),correctedGlSha256:await hash(correctedGl.legacy),baselineVsCorrected:difference(legacy,correctedGl.legacy),nativeVsCorrected:difference(nativeReplay!,correctedGl.legacy),correctedStageComparison:stages?compareStages(nativeStages,correctedGl.glStages):null,baselineVsCorrectedStages:stages?compareStages(glStages,correctedGl.glStages):null,correctedStageMetadata:stages?{metadata:correctedGl.glCapture?.metadata,primitives:correctedGl.glCapture?.primitiveMetadata,chronology:correctedGl.glCapture?.chronology}:null,glError:correctedGl.glError,correctedImage:exportImages?layerPng(correctedGl.legacy):undefined,scope:'Second actual production GL owner; identical tape/paper/source policy/native bytes, diagnostic noise source only'}:null
 const diffuseOracle=staticDiffuseOracle?await diffuseHeightOracle(glStages,glCapture?.primitiveMetadata.diffuse,paper,side):null
 const frontOracle=frontExpected?await sameInputFrontOracle(glStages,frontExpected,glCapture?.primitiveMetadata.selectedFront,paper,side,lazyFrontOracle,staticFrontOracle,diagnosticFrontSourceFilter):null
 const sequenceOracle=coverageSequence?await coverageSequenceOracle(capturedCoverage,paper,side,coverageSameInputIndices,coverageStampDebug,diagnosticGlConsistentNoise,coverageBlankSelected,diagnosticLiteralStampVertex,diagnosticCpuStampTrig):null
 const coverageOracle=coveragePrimitives?await coveragePrimitiveOracle(capturedCoverage,paper,side):null
 return{sourceCommands:coverageSequence?sourceCommandManifest(capturedCoverage):undefined,submissionMetrics,nativeComputeMs,nativeReplayComputeMs,nativeSubmissions,nativeReplaySubmissions,diagnosticSourceLiveSubmission,diffuseOracle,diagnosticStaticDiffuseHeight,staticDiffuseOracle,diagnosticStaticFrontCache,staticFrontOracle,nativeFrontCacheCounters,replayFrontCacheCounters,wetSnapshots:exportWetSnapshots?wetSnapshots:undefined,productionGlDiagnostic,sequenceOracle,actualGlDither,coverageOracle,frontOracle,images:exportImages?{nativeLayer:layerPng(nativeReplay!),productionGlLayer:layerPng(legacy),diff:diffPng(nativeReplay!,legacy)}:undefined,inputKind:suppliedTape?'supplied captured packed tape':'generated pointer fixture',code:'__CODE__',size,diagnosticHardwareLinearInputs,diagnosticLazyFrontClimb,lazyFrontOracle,diagnosticSamplingScope:'Native settle only; source and GL baseline unchanged',frontIndex,pressureCopyInvariant:stages==='pressure'?{native:pressureCopyInvariant(nativeStages),gl:pressureCopyInvariant(glStages)}:null,mode11Correlation:stages==='coverage'?correlateMode11(nativeStages,glStages):null,stageComparison:stages?compareStages(nativeStages,glStages):null,stageMetadata:stages?{native:nativeCapture?.metadata,gl:glCapture?.metadata,nativePrimitives:nativeCapture?.primitiveMetadata,glPrimitives:glCapture?.primitiveMetadata,nativeChronology:nativeCapture?.chronology,glChronology:glCapture?.chronology}:null,memoryGiB,estimatedPeakMiB,nativeMs,nativeReplayMs,replayPreservedTape,nativeReplaySha256:await hash(nativeReplay!),authorVsNativeReplay:difference(native!,nativeReplay!),nativeReplayVsLegacy:difference(nativeReplay!,legacy),nativeReplayNonzero:nativeReplay!.some(x=>x!==0),legacyMs:baselineGl.legacyMs,renderer,software:/swiftshader|llvmpipe/i.test(renderer??''),tape,tapeSha256:await hash(new TextEncoder().encode(JSON.stringify(tape))),paperSha256:await hash(la),nativeSha256:await hash(native!),legacySha256:await hash(legacy),wholeLayer:difference(native!,legacy),nativeNonzero:native!.some(x=>x!==0),legacyNonzero:legacy.some(x=>x!==0),errors,lost,glError,limitations:['Single1024 tile/layer/wash; serial settle; no Room/server/concurrency claim','Software difference is an observation, not hardware exactness','Final whole material layer; no claim of all transient fields parity','Native pointer event batches vs authoritative GL packed operation replay; batch-boundary discrepancy is detectable']}
}
export async function runSourceCoverage({operation,indices,blank=false,cpuTrig=false,literalVertex=false,probeSites=[[572,435],[565,436],[566,436]],debugRibbonTriangles,ditherBoth=false,ribbonFmaOctave=false}:{operation:import('@grafetto/shared').StrokeOperation;indices:number[];blank?:boolean;cpuTrig?:boolean;literalVertex?:boolean;probeSites?:readonly(readonly[number,number])[];debugRibbonTriangles?:readonly number[];ditherBoth?:boolean;ribbonFmaOctave?:boolean}){
 const commands=replaySourceCoverage(operation,sourceOptions),la=await getPaperBytes('fine'),side=Math.sqrt(la.length/2),paper=new Uint8Array(side*side*4)
 for(let i=0;i<la.length/2;i++){paper[i*4]=paper[i*4+1]=paper[i*4+2]=la[i*2];paper[i*4+3]=la[i*2+1]}
 return{code:'__SOURCE_CODE__',operationSha256:await hash(new TextEncoder().encode(JSON.stringify(operation))),paperSha256:await hash(la),sourceCommands:sourceCommandManifest(commands),oracle:await coverageSequenceOracle(commands,paper,side,indices,false,undefined,blank,literalVertex,cpuTrig,probeSites,!ditherBoth,debugRibbonTriangles,ribbonFmaOctave),limits:'Original fixed100 zero-seed single dry-landing source fixture; no settle/Room/performance claim'}
}
export async function runSourceContribution({operation,substitutions=[]}:{operation:import('@grafetto/shared').StrokeOperation;substitutions?:number[]}){
 const commands=replaySourceCoverage(operation,sourceOptions),la=await getPaperBytes('fine'),side=Math.sqrt(la.length/2),paper=new Uint8Array(side*side*4)
 for(let i=0;i<la.length/2;i++){paper[i*4]=paper[i*4+1]=paper[i*4+2]=la[i*2];paper[i*4+3]=la[i*2+1]}
 return{code:'__SOURCE_CODE__',operationSha256:await hash(new TextEncoder().encode(JSON.stringify(operation))),paperSha256:await hash(la),sourceCommands:sourceCommandManifest(commands),oracle:await sourceContribution(commands,paper,side,substitutions),limits:'All original coverage commands only; GL Q8 coverage replacement immediately after selected command; no P/C/settle or Room fidelity/performance claim. Persistent GL target with three readback checkpoints; readbacks invalidate timing comparisons.'}
}
Object.assign(window,{runEndToEnd,runSourceCoverage,runSourceContribution,runCommonSourceSolver})

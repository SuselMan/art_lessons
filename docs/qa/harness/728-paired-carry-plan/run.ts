import { StageAudit,compareStages,type StageRow } from './stageAudit'
import type { StrokeOperation } from '@grafetto/shared'
import { getPaperBytes } from '../../../../apps/web/src/engine/src/paper/paperLoader'
import { CanonicalWatercolorWebGpu } from '../../../../apps/web/src/engine/src/webgpuCanonical/backend'
import { CanonicalBoundedSceneRunner } from '../../../../apps/web/src/engine/src/webgpuCanonical/boundedSceneRunner'
import type { CanonicalFieldBuffer, CanonicalSettleField } from '../../../../apps/web/src/engine/src/webgpuCanonical/fieldBuffer'
import type { PointerData } from '../../../../apps/web/src/engine/src/input/PointerInput'
import type { WatercolorGestureSettings } from '../../../../apps/web/src/engine/src/input/CanonicalWatercolorGesture'
const originalFetch=window.fetch.bind(window)
window.fetch=((input:RequestInfo|URL,init?:RequestInit)=>originalFetch(typeof input==='string'&&input.startsWith('/paper/')?new URL('./paper/'+input.slice(7),location.href):input,init)) as typeof fetch
const progress=(stage:string)=>{Object.assign(window,{__pairedCarryABProgress:{stage,at:performance.now()}});console.info('CARRYAB '+stage)}
const sourceOptions={diagnosticWaterPolicy:'bottomless',diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticLandingPolicy:'fluid',diagnosticCanonicalSettleRadius:true,diagnosticSolventField:true,diagnosticPigmentRecord:true} as const
const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer)),v=>v.toString(16).padStart(2,'0')).join('')
const diff=(a:Uint8Array,b:Uint8Array)=>{if(a.length!==b.length)throw new Error('Capture dimensions changed');let changed=0,max=0,total=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);changed+=+(d>0);max=Math.max(max,d);total+=d}return{changed,max,total}}
interface Counts {submits:number;commandBuffers:number;submitCpuMs:number;quanta:number;encodeCpuMs:number}
interface RoleCapture {width:number;height:number;nonzero:number;sha256:string;difference:ReturnType<typeof diff>}
interface RunRow {paired:boolean;metrics:Record<'source'|'live'|'prepare'|'settle',Counts>;replayCpuMs:number;waitWallMs:number;wallMs:number;readbackWallMs:number;roles:Record<string,RoleCapture>;solventCheckpoints:Record<string,RoleCapture>;errors:string[];lost:boolean;pairedCarryCalls:number;stages:StageRow[];carryOracle:Awaited<ReturnType<CanonicalBoundedSceneRunner['adapter']['readCarryOracle']>>}
const count=():Counts=>({submits:0,commandBuffers:0,submitCpuMs:0,quanta:0,encodeCpuMs:0})
export async function runPairedCarryAB({size=100,allowLarge=false,tape:provided,pairedFirst=false,captureSolvent=false,hardwareLinear=false,progressive=false,controlRepeat=false,perOperationStages=false,oraclePairIndex}:{perOperationStages?:boolean;controlRepeat?:boolean;oraclePairIndex?:number;hardwareLinear?:boolean;progressive?:boolean;captureSolvent?:boolean;size?:100|400;allowLarge?:boolean;tape?:StrokeOperation[];pairedFirst?:boolean}={}){
 if(perOperationStages&&(!controlRepeat||progressive||captureSolvent||oraclePairIndex!==undefined))throw new Error('Per-op stage gate is isolated serial OFF/OFF only')
 if(progressive&&captureSolvent)throw new Error('Solvent source/finish captures require serial synchronous settle; progressive final-role gate remains supported')
 if(controlRepeat&&oraclePairIndex!==undefined)throw new Error('OFF/OFF repeat has no paired oracle; run separately')
 if(oraclePairIndex!==undefined&&(!Number.isInteger(oraclePairIndex)||oraclePairIndex<0||oraclePairIndex>128))throw new Error('Bounded actual oracle pair index invalid')
 const memoryGiB=(navigator as Navigator&{deviceMemory?:number}).deviceMemory??null
 if(size===400&&(!allowLarge||memoryGiB!==null&&memoryGiB<4))return{skipped:true,reason:'400 needs allowLarge and >=4GiB reported memory when present',memoryGiB}
 const la=await getPaperBytes('fine'),side=Math.sqrt(la.length/2),paper=new Uint8Array(side*side*4)
 if(!Number.isInteger(side))throw new Error('Invalid paper LA dimensions')
 for(let i=0;i<la.length/2;i++)paper.set([la[i*2],la[i*2],la[i*2],la[i*2+1]],i*4)
 const tape:StrokeOperation[]=provided?structuredClone(provided):[]
 const surface=document.querySelector('#surface')!;surface.replaceChildren()
 let now=1000,timestamp=1791400001000,index=0
 const create=async(paired:boolean,record=false)=>{
  const canvas=document.createElement('canvas');surface.append(canvas)
  const backend=await CanonicalWatercolorWebGpu.create({canvas,width:1024,height:1024,paper:{bytes:paper,width:side,height:side,origin:[0,0],texSize:[1024,1024],scale:1}})
  const errors:string[]=[];backend.device.addEventListener('uncapturederror',e=>errors.push(e.error.message));let lost=false
  void backend.device.lost.then(info=>{if(info.reason!=='destroyed')lost=true})
  const runner=new CanonicalBoundedSceneRunner(backend,{sourceOptions,groupedSettleSubmission:false,diagnosticStaticFrontCache:false,diagnosticStaticDiffuseHeight:false,diagnosticLazyFrontClimb:false,diagnosticPairedCarry:paired,diagnosticCarryOracleIndex:paired?oraclePairIndex:undefined,diagnosticHardwareLinearInputs:hardwareLinear,progressiveSettle:progressive,now:()=>now,timestamp:()=>timestamp,operationId:()=>`paired-fixed-${index++}`,onLocalOperation:op=>{if(record){if(op.type!=='stroke')throw new Error('Nonstroke capture');tape.push(structuredClone(op))}}})
  const destroy=async()=>{try{await runner.drain();runner.destroy()}finally{backend.destroy();canvas.remove()}}
  return{backend,runner,errors,get lost(){return lost},destroy}
 }
 if(!provided){
  // Untimed canonical pointer authoring produces ONE authoritative packed tape.
  // A/B runs both replay this same tape; neither regenerates wetness/dabs/seed.
  progress('authoring owner create');const author=await create(false,true)
  try{
   const settings:WatercolorGestureSettings={tool:'watercolor',preset:'normal:100:100:PB29:round',size,opacity:1,color:[.2,.1,.5],nibAngle:{angle:0,anchor:'canvas'},tiltResponse:'smooth'}
   const pointer=(x:number,y:number):PointerData=>({x,y,pressure:.8,tiltX:0,tiltY:0,speed:.2,timeStamp:now,pointerType:'pen'})
   const draw=async(id:string,points:number[][],pigment:number,color:WatercolorGestureSettings['color']=settings.color)=>{
    now+=100;timestamp=1791400000000+now
    author.runner.begin(pointer(points[0][0],points[0][1]),{...settings,color,preset:`normal:100:${pigment}:PB29:round`},{strokeId:id,washId:'paired-wash',layerId:'L',userId:'qa-paired'})
    for(const [x,y] of points.slice(1)){now+=16;author.runner.move(pointer(x,y))}
    now+=16;author.runner.end(pointer(points.at(-1)![0],points.at(-1)![1]));await author.runner.drain();progress('authored '+id)
   }
   if(size===400){await draw('paired-water',[[400,500],[500,500],[600,500]],0);await draw('paired-pigment',[[440,500],[500,500],[560,500]],100)}
   else await draw('paired-zigzag',[[300,350],[650,400],[300,450],[650,500],[300,550]],100)
   await draw('paired-second-color',[[500,420],[500,520],[560,550]],100,[.8,.2,.05])
   if(author.errors.length||author.lost)throw new Error('Authoring GPU failure '+JSON.stringify(author.errors))
  }finally{await author.destroy()}
 }
 if(perOperationStages&&tape.length>8)throw new Error('Per-op stage gate bounded to eight operations')
 if(!tape.length||tape.some(op=>op.type!=='stroke'||op.tool!=='watercolor'||!op.dabsPacked))throw new Error('Requires nonempty canonical packed watercolor tape')
 if(captureSolvent&&tape.length>8)throw new Error('Solvent localization is bounded to eight packed operations')
 const tapeSha256=await hash(new TextEncoder().encode(JSON.stringify(tape)))
 const baseline=new Map<string,{bytes:Uint8Array;width:number;height:number}>(),rows:RunRow[]=[]
 for(const paired of controlRepeat?[false,false]:pairedFirst?[true,false]:[false,true]){
  progress('create replay '+(paired?'ON':'OFF'));now=1000;const run=await create(paired)
  const {runner,backend}=run
  let phase:'source'|'live'|'prepare'|'settle'='source'
  const metrics={source:count(),live:count(),prepare:count(),settle:count()}
  // QA-only inspection/instrumentation. Source metadata/solver values unchanged.
  const internals=runner as unknown as {source:{execute:(...args:any[])=>GPUBuffer[]};finish:{encodeLive:(...args:any[])=>GPUBuffer[]};planner:{prepare:(...args:any[])=>unknown};settle:()=>void}
  let replayIndex=0
  const pendingSolvent:Array<{key:string;width:number;height:number;bytes:Promise<Uint8Array>}>=[]
  const capture= (stage:string)=>{
   if(!captureSolvent)return
   const entry=runner.scratch.peek(runner.target.buffer)
   for(const role of ['solventBase','solventLoad','strokeSolvent'] as const){const b=entry?.[role];if(!b)continue
    // readBytes submits its copy immediately before yielding: queue chronology
    // freezes this boundary before subsequent settle writes. Exclude counters.
    const hooked=backend.device.queue.submit
    backend.device.queue.submit=submit
    try{pendingSolvent.push({key:`${replayIndex}.${stage}.${role}`,width:b.width,height:b.height,bytes:b.readBytes()})}finally{backend.device.queue.submit=hooked}
   }
  }
  const audit=perOperationStages?new StageAudit():null,stages:StageRow[]=[],sourceStages:Array<Promise<StageRow>>=[]
  const stageBuffers=()=>{const e=runner.scratch.peek(runner.target.buffer);return{layer:runner.target.buffer,'tile.colorBase':e?.colorBase,'tile.solventLoad':e?.solventLoad,'field.pressure':field?.pressure}}
  const stageRead=(b:CanonicalFieldBuffer)=>{const hook=backend.device.queue.submit;backend.device.queue.submit=submit;try{return b.readBytes()}finally{backend.device.queue.submit=hook}}
  const settle=internals.settle.bind(runner);internals.settle=()=>{if(audit)sourceStages.push(audit.snapshot(replayIndex,'source-before-settle',stageBuffers(),stageRead));capture('source');phase='settle';try{const result=settle();capture('finish');return result}finally{phase='source'}}
  const execute=internals.source.execute.bind(internals.source);internals.source.execute=(...args)=>{phase='source';audit?.record('source',args.slice(1));return execute(...args)}
  const live=internals.finish.encodeLive.bind(internals.finish);internals.finish.encodeLive=(...args)=>{phase='live';return live(...args)}
  const prepare=internals.planner.prepare.bind(internals.planner);internals.planner.prepare=(...args)=>{phase='prepare';audit?.record('plan',args.slice(2));return prepare(...args)}
  let field:CanonicalSettleField|null=null
  const fieldFor=runner.fieldOwner.fieldFor.bind(runner.fieldOwner);runner.fieldOwner.fieldFor=(...args)=>field=fieldFor(...args)
  if(audit){const target=runner.adapter as unknown as Record<string,(...args:unknown[])=>unknown>;for(const name of ['fieldOp','pigmentColor','costDomainStep','diffuseStep','wcResample','waterFrontStep','brushPass','brushPair','carryPair']){const original=target[name].bind(runner.adapter);target[name]=(...args)=>{audit.record('pass',[name,...args]);return original(...args)}}}
  if(audit){for(const name of ['uploadFlow','uploadForeign'] as const){const original=runner.adapter.uploads[name].bind(runner.adapter.uploads);(runner.adapter.uploads as unknown as Record<string,(...args:unknown[])=>unknown>)[name]=(...args)=>{audit.record('pass',[name,...args.slice(1)]);return (original as (...args:unknown[])=>unknown)(...args)}}}
  const queue=backend.device.queue,submit=queue.submit.bind(queue)
  queue.submit=(buffers)=>{const b=Array.from(buffers),m=metrics[phase],t=performance.now();submit(b);m.submitCpuMs+=performance.now()-t;m.submits++;m.commandBuffers+=b.length}
  const quantum=runner.adapter.runQuantum.bind(runner.adapter)
  runner.adapter.runQuantum=(task)=>{
   phase=phase==='prepare'||progressive&&(runner as unknown as {busy:boolean}).busy?'settle':phase
   const t=performance.now();const result=quantum(task),m=metrics[phase];m.quanta++;m.encodeCpuMs+=performance.now()-t;return result
  }
  const roles:Record<string,RoleCapture>={};let replayCpuMs=0,waitWallMs=0,wallMs=0,readbackWallMs=0
  try{
   await runner.drain();for(const m of Object.values(metrics))Object.assign(m,count())
   backend.device.pushErrorScope('validation')
   const started=performance.now()
   for(const operation of tape){audit?.reset();replayIndex++;timestamp=operation.timestamp;now+=100;const t=performance.now();runner.replay(structuredClone(operation));replayCpuMs+=performance.now()-t;const waiting=performance.now();await runner.drain();waitWallMs+=performance.now()-waiting;progress('replay drained '+(paired?'ON':'OFF')+' '+operation.id);if(audit){const sources=sourceStages.splice(0);for(const pending of sources)stages.push(await pending);stages.push(await audit.snapshot(replayIndex,'after-finish',stageBuffers(),stageRead));}}
   wallMs=performance.now()-started;progress('readback '+(paired?'ON':'OFF'))
   if(!field)throw new Error('No canonical settle field captured')
   const capturedField=field as CanonicalSettleField
   if(capturedField.w<1536||capturedField.h<1536)throw new Error('Compact field is not a production-size gate')
   // Freeze counters before all readbacks/hashes. Do not count capture submissions.
   queue.submit=submit
   const readStarted=performance.now(),entry=runner.scratch.peek(runner.target.buffer)!
   const buffers:Record<string,CanonicalFieldBuffer>={layer:runner.target.buffer}
   for(const role of ['original','coverageFilm','inkLoad','inkColor','inkSettled','colorSettled','strokeInk','inkBase','strokeColor','colorBase','coverage','inkDry','colorDry','solventLoad','solventBase','strokeSolvent','foreignSolventLoad'] as const){const b=entry[role];if(b)buffers['tile.'+role]=b}
   for(const role of ['a','b','c','ca','cb','cc','coverage','mask','pressure','band'] as const)buffers['field.'+role]=capturedField[role]
   for(const [role,buffer] of Object.entries(buffers)){
    const bytes=await buffer.readBytes(),nonzero=bytes.reduce((n,v)=>n+ +(v!==0),0)
    if(!rows.length)baseline.set(role,{bytes,width:buffer.width,height:buffer.height})
    const control=baseline.get(role);if(!control||control.width!==buffer.width||control.height!==buffer.height)throw new Error('Role/dimension mismatch '+role)
    roles[role]={width:buffer.width,height:buffer.height,nonzero,sha256:await hash(bytes),difference:diff(control.bytes,bytes)}
   }
   if(rows.length&&Object.keys(buffers).length!==[...baseline.keys()].filter(k=>!k.startsWith('checkpoint.')).length)throw new Error('Different retained role count')
   const solventCheckpoints:Record<string,RoleCapture>={}
   for(const checkpoint of pendingSolvent){const bytes=await checkpoint.bytes,key='checkpoint.'+checkpoint.key
    if(!rows.length)baseline.set(key,{bytes,width:checkpoint.width,height:checkpoint.height})
    const control=baseline.get(key);if(!control)throw new Error('Missing solvent checkpoint '+key)
    solventCheckpoints[checkpoint.key]={width:checkpoint.width,height:checkpoint.height,nonzero:bytes.reduce((n,v)=>n+ +(v!==0),0),sha256:await hash(bytes),difference:diff(control.bytes,bytes)}
   }
   if(rows.length&&pendingSolvent.length!==Object.keys(rows[0].solventCheckpoints).length)throw new Error('Different solvent checkpoint count')
   const carryOracle=await runner.adapter.readCarryOracle()
   if(paired&&oraclePairIndex!==undefined&&!carryOracle)throw new Error('Selected actual carry pair was not exercised')
   readbackWallMs=performance.now()-readStarted
   const validation=await backend.device.popErrorScope();if(validation)run.errors.push(validation.message)
   rows.push({paired,metrics,replayCpuMs,waitWallMs,wallMs,readbackWallMs,roles,solventCheckpoints,errors:[...run.errors],lost:run.lost,pairedCarryCalls:runner.adapter.pairedCarryCalls,stages,carryOracle})
  }finally{queue.submit=submit;await run.destroy()}
 }
 surface.replaceChildren()
 const stageComparison=perOperationStages?compareStages(rows[0].stages,rows[1].stages):null
 const exact=(!stageComparison||stageComparison.exact)&&(controlRepeat||rows.some(row=>row.paired&&row.pairedCarryCalls>0))&&rows.length===2&&rows.every(row=>!row.errors.length&&!row.lost&&(!row.carryOracle||row.carryOracle.exact)&&[...Object.values(row.roles),...Object.values(row.solventCheckpoints)].every(r=>r.difference.changed===0))&&['layer','tile.inkLoad','tile.inkColor','tile.coverage'].every(role=>rows[0].roles[role]?.nonzero)
 return{code:'__CODE__',order:rows.map(row=>row.paired?'ON':'OFF'),size,controlRepeat,perOperationStages,stageComparison,timingPerturbedByStages:perOperationStages,oraclePairIndex,timingPerturbedByOracle:oraclePairIndex!==undefined,hardwareLinear,progressive,captureSolvent,timingPerturbedByCapture:captureSolvent,memoryGiB,tape,tapeSha256,paperSha256:await hash(la),rows,exact,limitations:['Native OFF/ON internal equivalence, not GL parity or Room integration','Full1536 fields, single1024 tile/layer/wash; owners sequential','Capture after last canonical operation only; no intermediate history','wallMs excludes readback, hashing, setup and untimed pointer authoring','encodeCpuMs/replayCpuMs are CPU wall intervals, not shader GPU time; waitWallMs is completion wait','Paired carry defaults OFF; grouped submissions disabled in both arms']}
}
Object.assign(window,{runPairedCarryAB})

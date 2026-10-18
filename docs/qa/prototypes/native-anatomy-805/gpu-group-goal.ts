/** QA only. EXT_disjoint_timer_query measures GPU timeline elapsed intervals,
 * including possible GPU idle time while the CPU filters/reads/uploads.
 * Source/output proofs are delegated to the unchanged native-direct runner.
 * Spec: https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query/
 */
const KEY = '__qaNativeAnatomy805'
type Query = object
interface TimerExtension {
 TIME_ELAPSED_EXT:number; CURRENT_QUERY_EXT:number; QUERY_COUNTER_BITS_EXT:number
 QUERY_RESULT_EXT:number; QUERY_RESULT_AVAILABLE_EXT:number; GPU_DISJOINT_EXT:number
 createQueryEXT():Query|null; deleteQueryEXT(query:Query):void
 beginQueryEXT(target:number,query:Query):void; endQueryEXT(target:number):void
 getQueryEXT(target:number,pname:number):unknown
 getQueryObjectEXT(query:Query,pname:number):unknown
}
export interface NativeGpuProof805 {
 outputSHA:Record<string,string>; sourceSHA:Record<string,string>; sourceSHAAfter:Record<string,string>
 sourceUnchanged:boolean; metadataSHA:string
}
export const GPU_GROUPS_805 = [
 {id:'ungrouped',label:'Начальные копии и выравнивание',scope:'Вход в native core → align.rawP; GPU-копии исходника и согласование P/C'},
 {id:'prepare',label:'Усреднить цвет',scope:'align.rawP → contrast.background'},
 {id:'selection',label:'Выбрать переносимую краску и собрать поле',scope:'contrast.background → stitch.complete; включает CPU-фильтр, его GPU-readback/upload, reference и сборку поля'},
 {id:'paths',label:'Построить пути и кромку',scope:'stitch.complete → front.rimPrepared; включает подготовку mobile, front/prefix и кромку'},
 {id:'transport',label:'Перенести, смешать и осадить краску',scope:'front.rimPrepared → diffusion.complete'},
 {id:'assemble',label:'Собрать итоговый мазок',scope:'diffusion.complete → land.complete; terminal sums/rim и восстановление'},
 {id:'background',label:'Смягчить заливку',scope:'land.complete → второй background.reconstruct; включает публикацию и background mix'},
 {id:'protect',label:'Сохранить сухое и завершить цель',scope:'Второй background.reconstruct → возврат native core; dryGuard, dry.coverage и весь завершающий хвост'}
] as const

function assertProof(result:NativeGpuProof805,baseline?:NativeGpuProof805){
 const valid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
 for(const key of ['p','c','coverage'])if(!valid(result.outputSHA?.[key]))throw Error('GPU timing missing output proof '+key)
 const sourceKeys=['p','c','coverage','solvent','foreign','original','paper']
 for(const key of sourceKeys){if(!valid(result.sourceSHA?.[key])||result.sourceSHA[key]!==result.sourceSHAAfter?.[key])throw Error('GPU timing changed/missing source '+key)}
 if(result.sourceUnchanged!==true||!valid(result.metadataSHA))throw Error('GPU timing missing unchanged/metadata proof')
 if(baseline){
  assertProof(baseline)
  for(const key of ['p','c','coverage'])if(result.outputSHA[key]!==baseline.outputSHA[key])throw Error('GPU timing baseline output differs '+key)
  for(const key of sourceKeys)if(result.sourceSHA[key]!==baseline.sourceSHA[key])throw Error('GPU timing baseline input differs '+key)
  if(result.metadataSHA!==baseline.metadataSHA)throw Error('GPU timing baseline metadata differs')
 }
}

export async function runNativeGpuTimedGoal805<T extends NativeGpuProof805>(options:{
 gl:WebGLRenderingContext; controller:{diagnosticRunCore:(...args:unknown[])=>unknown}
 runDirect:()=>Promise<T>; mode:'whole'|'groups'; baseline?:NativeGpuProof805
 timeoutMs?:number; pollMs?:number
 /** Injectable for CPU orchestration tests; production defaults always yield to browser. */
 now?:()=>number; pause?:(ms:number)=>Promise<void>
}){
 const {gl,controller,mode}=options
 if(mode!=='whole'&&mode!=='groups')throw Error('GPU timing invalid mode')
 const ext=gl.getExtension('EXT_disjoint_timer_query') as TimerExtension|null
 if(!ext)throw Error('GPU timing EXT_disjoint_timer_query unavailable')
 const counterBits=ext.getQueryEXT(ext.TIME_ELAPSED_EXT,ext.QUERY_COUNTER_BITS_EXT)
 if(typeof counterBits!=='number'||counterBits<=0)throw Error('GPU timing elapsed counter unavailable')
 if(ext.getQueryEXT(ext.TIME_ELAPSED_EXT,ext.CURRENT_QUERY_EXT)!==null)throw Error('GPU timing nested external query')
 if(gl.isContextLost())throw Error('GPU timing context lost')
 if(gl.getParameter(ext.GPU_DISJOINT_EXT))throw Error('GPU timing disjoint before measurement')
 const target=globalThis as unknown as Record<string,unknown>,descriptor=Object.getOwnPropertyDescriptor(target,KEY)
 if(target[KEY]!==undefined)throw Error('GPU timing observer already installed')
 const original=controller.diagnosticRunCore,now=options.now??(()=>performance.now())
 const pause=options.pause??((ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)))
 const timeout=options.timeoutMs??15000,pollMs=options.pollMs??8
 if(!Number.isFinite(timeout)||timeout<=0||!Number.isFinite(pollMs)||pollMs<0)throw Error('GPU timing invalid poll options')
 const plan=mode==='groups'?GPU_GROUPS_805:[{id:'whole',label:'Весь native core',scope:'Вход → возврат reset/step/dry; без итогового C-readback, hash и исходных proof reads'}]
 const queries:{query:Query;id:string;label:string;scope:string}[]=[]
 let active:Query|null=null,index=-1,coreCalls=0,inCore=false,backgroundSeen=0,drySeen=false,eventsSeen=0
 const finish=()=>{if(!active)throw Error('GPU timing end without active query');if(ext.getQueryEXT(ext.TIME_ELAPSED_EXT,ext.CURRENT_QUERY_EXT)!==active)throw Error('GPU timing query ownership/nesting changed');ext.endQueryEXT(ext.TIME_ELAPSED_EXT);active=null}
 const begin=(i:number)=>{if(active)throw Error('GPU timing nested query');const q=queries[i];if(!q)throw Error('GPU timing missing query');if(ext.getQueryEXT(ext.TIME_ELAPSED_EXT,ext.CURRENT_QUERY_EXT)!==null)throw Error('GPU timing unexpected external query');ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,q.query);active=q.query;index=i}
 const advance=(expected:number)=>{if(index!==expected-1)throw Error('GPU timing semantic boundary out of order '+expected);finish();begin(expected)}
 const hook=(event:{stage?:string})=>{
  if(!inCore)throw Error('GPU timing event outside core')
  eventsSeen++
  if(event.stage==='dry.coverage'){if(drySeen||index!==(mode==='groups'?7:0))throw Error('GPU timing unexpected dry boundary');drySeen=true}
  if(mode==='whole')return
  const stage=event.stage
  if(stage==='align.rawP')advance(1)
  else if(stage==='contrast.background')advance(2)
  else if(stage==='stitch.complete')advance(3)
  else if(stage==='front.rimPrepared')advance(4)
  else if(stage==='diffusion.complete')advance(5)
  else if(stage==='land.complete')advance(6)
  else if(stage==='background.reconstruct'&&++backgroundSeen===2)advance(7)
  else if(stage==='background.reconstruct'&&backgroundSeen>2)throw Error('GPU timing duplicate background boundary')
 }
 try{
  for(const group of plan){const query=ext.createQueryEXT();if(!query)throw Error('GPU timing query allocation failed');queries.push({query,...group})}
  Object.defineProperty(target,KEY,{configurable:true,writable:true,value:hook})
  controller.diagnosticRunCore=function(...args:unknown[]){
   if(inCore||++coreCalls!==1)throw Error('GPU timing core nesting/repeat')
   if(gl.getParameter(ext.GPU_DISJOINT_EXT))throw Error('GPU timing disjoint at core start')
   inCore=true;begin(0)
   try{
    const result=original.apply(this,args)
    if(!drySeen||!eventsSeen||(mode==='groups'&&index!==7))throw Error('GPU timing missing semantic boundary')
    finish();return result
   }finally{inCore=false}
  }
  const result=await options.runDirect()
  controller.diagnosticRunCore=original
  if(coreCalls!==1||active)throw Error('GPU timing missing/incomplete core')
  assertProof(result,options.baseline)
  if(gl.getParameter(ext.GPU_DISJOINT_EXT))throw Error('GPU timing disjoint after core')
  gl.flush()
  const pollStart=now()
  // Per spec availability cannot change within the task that issued queries.
  await pause(0)
  for(;;){
   if(gl.isContextLost())throw Error('GPU timing context lost while polling')
   if(gl.getParameter(ext.GPU_DISJOINT_EXT))throw Error('GPU timing disjoint while polling')
   const ready=queries.every(q=>ext.getQueryObjectEXT(q.query,ext.QUERY_RESULT_AVAILABLE_EXT)===true)
   if(ready)break
   if(now()-pollStart>=timeout)throw Error('GPU timing query timeout')
   await pause(pollMs)
  }
  const intervals=queries.map(({query,...group})=>{
   const ns=ext.getQueryObjectEXT(query,ext.QUERY_RESULT_EXT)
   if(typeof ns!=='number'||!Number.isSafeInteger(ns)||ns<=0)throw Error('GPU timing missing/zero/invalid result '+group.id)
   return{...group,gpuNs:ns,gpuMs:ns/1e6}
  })
  if(gl.getParameter(ext.GPU_DISJOINT_EXT))throw Error('GPU timing disjoint at result')
  const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('GPU timing WebGL error '+error)
  return{...result,gpu:{mode,counterBits,intervals,totalGpuMs:intervals.reduce((n,q)=>n+q.gpuMs,0),pollWallMs:now()-pollStart,eventsSeen,baselineCompared:!!options.baseline,disjoint:false,scope:'GPU timeline elapsed during native reset/step/dry. Source proofs, output C/P/coverage reads, snapshots, hashes and query polling are outside queries.',qualification:'Includes possible GPU idle while CPU filters/reads/uploads. Not shader-active utilization. Groups are sequential non-overlapping intervals; compare their sum with an independent whole-query run, not a nested query. Initial ungrouped is reported explicitly; final tail belongs to protect. Query observer overhead remains; compare observer-free wall baseline separately.'}}
 }finally{
  controller.diagnosticRunCore=original
  try{
   if(active){try{ext.endQueryEXT(ext.TIME_ELAPSED_EXT)}catch{/* Context loss must not prevent releasing the observer. */}finally{active=null}}
   for(const {query}of queries){try{ext.deleteQueryEXT(query)}catch{/* Continue deleting remaining owned queries on failure. */}}
  }finally{if(descriptor)Object.defineProperty(target,KEY,descriptor);else delete target[KEY]}
 }
}

export const timestampBrowserPaths=['diagnosticTimestampDevice.ts','diagnosticPassTimestamps.ts','settlePlanAdapter.ts','passes/fieldBasic.ts'].map(p=>'apps/web/src/engine/src/webgpuCanonical/'+p)
export function parseTimestampDiagnostic(raw,{interactive,quantumCap,scopeCap}){
 if(![undefined,'0','1'].includes(raw))throw Error('Explicit timestamp diagnostic selection')
 const enabled=raw==='1'
 if(enabled&&(!interactive||quantumCap!==8||scopeCap!==0))throw Error('Timestamp measurement requires isolated interactive A original scheduling')
 return enabled
}
export function installTimestampRuntimeOption(Runtime){
 const original=Runtime.create
 if(typeof original!=='function')throw Error('Timestamp runtime constructor missing')
 let restored=false,calls=0
 const wrapped=function(ctx){if(restored)throw Error('Timestamp constructor hook retired');if(ctx.diagnosticTimestampQueries!==undefined)throw Error('Timestamp option already selected');calls++;return original.call(this,{...ctx,diagnosticTimestampQueries:true})}
 Runtime.create=wrapped
 return{get calls(){return calls},restore(){if(restored)return;restored=true;if(Runtime.create===wrapped)Runtime.create=original}}
}
export function assertTimestampRows(rows,capacity=1024){
 if(!Array.isArray(rows)||!rows.length||rows.length>capacity)throw Error('Timestamp rows missing or unbounded')
 const indices=new Set()
 for(const row of rows){if(!Number.isInteger(row.index)||row.index<0||row.index>=capacity||indices.has(row.index)||!Number.isInteger(row.quantum)||row.quantum<1||!['render','compute'].includes(row.kind)||typeof row.label!=='string'||row.label.length>160||typeof row.nanoseconds!=='string'||!/^\d{1,20}$/.test(row.nanoseconds))throw Error('Invalid bounded GPU timestamp row');indices.add(row.index)}
 return{passCount:rows.length,compute:rows.filter(r=>r.kind==='compute').length,render:rows.filter(r=>r.kind==='render').length,scope:'GPU pass duration in nanoseconds; no copy/upload outside passes, CPU wall, queue wait or causal gain'}
}
/** First nonempty material job AFTER actual pen DOWN; original FIFO is unchanged. */
export function installFirstMaterialTimestampWindow(runtime,central,eventTarget=document,now=()=>performance.now()){
 const prior=central.diagnosticObserver,scope={request:null,start:null,end:null,armedAt:null,emptyCandidates:0,nonempty:false,interleaved:false}
 runtime.setDiagnosticTimestampWindow(false)
 let restored=false
 const down=event=>{if(event.pointerType==='pen'&&scope.armedAt===null)scope.armedAt=now()}
 const observer=event=>{
  if(scope.armedAt!==null){
   if(event.kind==='material'&&scope.request===null&&event.phase==='prepare:start'){scope.request=event.request;scope.start=event.at;runtime.setDiagnosticTimestampWindow(true)}
   else if(scope.request!==null&&scope.end===null&&((event.kind==='source'&&event.phase==='execute')||(event.kind==='material'&&event.request!==scope.request&&event.phase==='prepare:start')))scope.interleaved=true
   if(event.kind==='material'&&event.request===scope.request){
    if(event.phase==='step:start')scope.nonempty=true
    if(event.phase==='prepare:empty'){runtime.setDiagnosticTimestampWindow(false);runtime.discardDiagnosticTimestampCandidate();scope.emptyCandidates++;scope.request=null;scope.start=null;scope.nonempty=false}
    if(event.phase==='finish:done'){runtime.setDiagnosticTimestampWindow(false);scope.end=event.at}
   }
  }
  prior?.(event)
 }
 const restore=()=>{if(restored)return;restored=true;try{eventTarget.removeEventListener('pointerdown',down,true)}finally{try{runtime.setDiagnosticTimestampWindow(false)}finally{if(central.diagnosticObserver===observer)central.diagnosticObserver=prior}}}
 central.diagnosticObserver=observer
 try{eventTarget.addEventListener('pointerdown',down,{capture:true})}catch(error){try{restore()}catch{/* Preserve original install rejection after attempting every cleanup. */}throw error}
 return{scope,restore}
}
export function assertFirstMaterialTimestampWindow(scope){if(!Number.isInteger(scope?.request)||scope.request<0||!Number.isFinite(scope.armedAt)||!Number.isFinite(scope.start)||!Number.isFinite(scope.end)||scope.start<scope.armedAt||scope.end<scope.start||!scope.nonempty||scope.interleaved)throw Error('First material timestamp window incomplete');return scope}
export function rankTimestampRows(rows){
 assertTimestampRows(rows)
 if(rows.some(r=>!r.label.trim())||!rows.some(r=>BigInt(r.nanoseconds)>0n))throw Error('Meaningful labelled timestamp durations required')
 const groups=new Map()
 for(const r of rows){const g=groups.get(r.label)??{label:r.label,count:0,total:0n};g.count++;g.total+=BigInt(r.nanoseconds);groups.set(r.label,g)}
 return [...groups.values()].sort((a,b)=>a.total>b.total?-1:a.total<b.total?1:a.label.localeCompare(b.label)).map(g=>({label:g.label,count:g.count,totalNanoseconds:g.total.toString(),meanNanosecondsFloor:(g.total/BigInt(g.count)).toString()}))
}

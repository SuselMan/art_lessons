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
/** Select exactly the first existing material request, never later source/job. */
export function installFirstMaterialTimestampWindow(runtime,central){
 const prior=central.diagnosticObserver,scope={request:null,start:null,end:null,empty:false}
 runtime.setDiagnosticTimestampWindow(false)
 let restored=false
 const observer=event=>{
  if(event.kind==='material'&&scope.request===null&&event.phase==='prepare:start'){scope.request=event.request;scope.start=event.at;runtime.setDiagnosticTimestampWindow(true)}
  if(event.kind==='material'&&event.request===scope.request&&(event.phase==='finish:done'||event.phase==='prepare:empty')){runtime.setDiagnosticTimestampWindow(false);scope.end=event.at;scope.empty=event.phase==='prepare:empty'}
  prior?.(event)
 }
 central.diagnosticObserver=observer
 return{scope,restore(){if(restored)return;restored=true;runtime.setDiagnosticTimestampWindow(false);if(central.diagnosticObserver===observer)central.diagnosticObserver=prior}}
}
export function assertFirstMaterialTimestampWindow(scope){if(!Number.isInteger(scope?.request)||scope.request<1||!Number.isFinite(scope.start)||!Number.isFinite(scope.end)||scope.end<scope.start||scope.empty)throw Error('First material timestamp window incomplete');return scope}

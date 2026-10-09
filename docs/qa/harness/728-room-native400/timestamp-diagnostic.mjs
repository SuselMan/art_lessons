export const timestampBrowserPaths=['diagnosticTimestampDevice.ts','diagnosticPassTimestamps.ts','settlePlanAdapter.ts'].map(p=>'apps/web/src/engine/src/webgpuCanonical/'+p)
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

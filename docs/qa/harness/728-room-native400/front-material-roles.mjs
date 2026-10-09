/** Endpoint-only diagnostic: sequential native Q8 reads AFTER operation idle.
 * No retained raw bytes or per-pass snapshots. Final pressure/mask are NOT
 * claimed to be the earlier outward-front cost before group tide overwrote it. */
export async function readNativeFrontMaterialRoles(engine,operationIndex,requirePigment=false){
 if(!Number.isInteger(operationIndex)||operationIndex<0||operationIndex>1)throw Error('Bounded two-op index required')
 const runtime=engine?._wcNative,owner=runtime?.owner,backend=runtime?.backend
 if(!runtime||!owner||!backend||!runtime.central?.isIdle||engine._wcCanonical?.pending||engine._settle||engine._wcAsyncError)throw Error('Actual canonical idle owner required')
 if(engine.gl.isContextLost()||engine.gl.getError())throw Error('Actual GL unavailable')
 // Logical FIFO idle can precede existing submitted-work release callbacks.
 // Diagnostic-only wait occurs after input, before any Q8 read; no hot fence.
 if(backend.diagnosticScopeState.pending>0)await backend.whenIdle()
 if(runtime.owner!==owner||!runtime.central.isIdle||engine._wcCanonical?.pending||engine._settle||engine._wcAsyncError)throw Error('Owner changed during submitted-work wait')
 if(backend.diagnosticScopeState.pending!==0||!backend.diagnosticScopeState.live)throw Error('Existing submitted scopes must already be released')
 const field=owner.fields?.current,material=owner.scratch?.peek(owner.target?.buffer)
 if(!field||!material?.inkLoad||!material.inkColor)throw Error('Actual native material roles absent')
 const fields={pressure:field.pressure,mask:field.mask,coverage:field.coverage,pigment:material.inkLoad,color:material.inkColor},roles={}
 for(const [role,buffer]of Object.entries(fields)){
  const input=buffer.field??buffer
  const bytes=input.width*input.height*4
  if(!Number.isInteger(bytes)||bytes<=0||bytes>9*1024*1024||input.format!=='rgba8unorm')throw Error('Bounded physical Q8 role required')
  const raw=await backend.readField(input)
  if(raw.length!==bytes)throw Error('Native read size differs')
  let nonzero=0;for(const value of raw)nonzero+=value!==0
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),v=>v.toString(16).padStart(2,'0')).join('')
  roles[role]={width:input.width,height:input.height,bytes,nonzero,sha256}
 }
 if(requirePigment&&(!roles.pigment.nonzero||!roles.color.nonzero))throw Error('Actual pigment/color roles empty')
 if(engine._wcCanonical?.pending||!runtime.central.isIdle||engine.gl.isContextLost()||engine.gl.getError())throw Error('Owner changed during idle capture')
 return{operationIndex,roles,nativeBrushPair:owner.adapter.diagnosticNativeBrushPair===true,pairedBrushCalls:owner.adapter.pairedBrushCalls??0,cache:owner.adapter.staticFrontCacheCounters,retirementCleanupFailures:backend.diagnosticRetirementCleanupFailures,scope:'Final Q8 cost/coverage/material roles after operation idle; no earlier outward-cost snapshot, no hot reads'}
}
export function assertFrontMaterialRolePair(off,on,mode='front-cache'){
 if(!Array.isArray(off)||!Array.isArray(on)||off.length!==2||on.length!==2)throw Error('Two per-operation captures required')
 const names=['pressure','mask','coverage','pigment','color']
 for(let i=0;i<2;i++)for(const arm of [off,on]){
  const row=arm[i];if(row.operationIndex!==i||row.retirementCleanupFailures!==0||Object.keys(row.roles??{}).sort().join()!==[...names].sort().join())throw Error('Actual ordered healthy role capture required')
  for(const name of names){const r=row.roles[name];if(!r||!Number.isInteger(r.bytes)||r.bytes!==r.width*r.height*4||r.bytes<=0||r.bytes>9*1024*1024||!Number.isInteger(r.nonzero)||r.nonzero<0||r.nonzero>r.bytes||!/^[a-f0-9]{64}$/.test(r.sha256))throw Error('Q8 role passport invalid')}
  if(i===1&&(!row.roles.pigment.nonzero||!row.roles.color.nonzero))throw Error('Final actual pigment roles absent')
 }
 for(let i=0;i<2;i++)for(const name of names)if(JSON.stringify(off[i].roles[name])!==JSON.stringify(on[i].roles[name]))throw Error('Q8 role differs '+i+':'+name)
 if(mode==='brush-pair'){if(off.some(row=>row.cache!==null||row.nativeBrushPair||row.pairedBrushCalls!==0)||on.some(row=>row.cache!==null||!row.nativeBrushPair)||!(on[0].pairedBrushCalls>0)||on[1].pairedBrushCalls<on[0].pairedBrushCalls)throw Error('Isolated paired brush consumption absent')}else if(mode!=='front-cache')throw Error('Unknown native pair mode')
 else if(off.some(row=>row.cache!==null)||!(on[0].cache?.prep>0)||!(on[0].cache?.hits>0)||on.some(row=>row.cache?.retainedBytes!==0||row.cache?.cleanupFailures!==0))throw Error('Exact cache OFF/ON consumption/retirement proof absent')
 return{exact:true,operations:2,roles:names,scope:'Two actual same-packed native arms, final per-operation Q8 roles; not full outer iteration or GL model parity'}
}

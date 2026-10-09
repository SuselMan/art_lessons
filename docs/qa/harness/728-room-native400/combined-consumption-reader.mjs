/** QA after-idle metadata only. No GPU reads, dispatches or fences. */
export async function readCombinedConsumptionJson(){
 const runtime=window.__engine?._wcNative,owner=runtime?.owner,backend=runtime?.backend,adapter=owner?.adapter
 if(!adapter||!runtime.central?.isIdle||backend?.diagnosticScopeState?.pending!==0||backend.diagnosticScopeState.live!==true)throw Error('Actual idle native metadata owner required')
 const factorVariants=[]
 for(const v of adapter.factorVariantDiagnostics){
  if(typeof v.code!=='string'||v.code.length>32768||factorVariants.length>=2)throw Error('Bounded actual compiled factor source required')
  const bytes=new TextEncoder().encode(v.code)
  factorVariants.push({staticCache:v.staticCache,encoded:v.encoded,shaderBytes:bytes.length,shaderSHA:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('')})
 }
 if(window.__engine?._wcNative!==runtime||runtime.owner!==owner||runtime.backend!==backend||!runtime.central.isIdle||backend.diagnosticScopeState.pending!==0||backend.diagnosticScopeState.live!==true)throw Error('Native owner changed during metadata hash')
 const row={factor:adapter.diagnosticStaticFrontCacheFactor===true,factorVariants,cache:adapter.staticFrontCacheCounters,paired:adapter.diagnosticNativeBrushPair===true,pairedCalls:adapter.pairedBrushCalls,film:adapter.diagnosticFrontFilmHoist===true,filmVariants:adapter.filmVariantDiagnostics}
 const json=JSON.stringify(row)
 if(typeof json!=='string'||json.length>65536)throw Error('Bounded primitive metadata JSON required')
 return json
}
export function parseCombinedConsumptionJson(json){
 if(typeof json!=='string'||json.length>65536)throw Error('CDP primitive metadata JSON absent')
 const row=JSON.parse(json)
 if(!row||typeof row!=='object'||Array.isArray(row)||!Array.isArray(row.factorVariants)||!Array.isArray(row.filmVariants))throw Error('Metadata JSON shape invalid')
 return row
}

export function combinedMetadataResponseShape(response){const r=response?.result;return{type:typeof r?.type==='string'?r.type:null,subtype:typeof r?.subtype==='string'?r.subtype:null,valueType:typeof r?.value,hasUnserializableValue:r?.unserializableValue!==undefined,hasException:!!response?.exceptionDetails}}
export function parseCombinedConsumptionCdpResponse(response){
 const shape=combinedMetadataResponseShape(response)
 if(shape.hasException||shape.type!=='string'||shape.valueType!=='string'||shape.hasUnserializableValue)throw Error('Typed CDP metadata response invalid '+JSON.stringify(shape))
 return parseCombinedConsumptionJson(response.result.value)
}

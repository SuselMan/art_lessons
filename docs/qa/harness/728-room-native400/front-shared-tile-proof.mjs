/** Actual post-idle shader consumption; no assumption that all strides are tiled. */
export function assertFrontSharedTileObserved(census,roles,plainSHA,tileSHA,enabled){
 const sha=x=>/^[a-f0-9]{64}$/.test(x??'');const rows=census?.observedFields
 if(typeof enabled!=='boolean'||!sha(plainSHA)||!sha(tileSHA)||plainSHA===tileSHA||!census.actualObservedEnabled||rows?.length!==2||rows.some(x=>!x.completed)||rows.find(x=>x.kind==='waterFront')?.hits!==0||rows.find(x=>x.kind==='diffuse')?.hits!==1)throw Error('Exact tile observed passport required')
 if(!Array.isArray(roles)||roles.length!==2)throw Error('Two tile captures required')
 for(const [i,r]of roles.entries()){
  const count=(i+1)*240,v=r.factorVariant,t=r.frontSharedTileVariants
  if(r.frontSharedTile!==enabled||!r.frontCacheFactor||r.frontFilmHoist||r.identityFieldCopy||r.mode5SharedTile||!r.nativeBrushPair||r.pairedBrushCalls!==210||r.retirementCleanupFailures!==0||r.cache?.prep!==i+1||r.cache.hits!==(i+1)*239||r.cache.fallbacks!==0||r.cache.retainedBytes!==0||r.cache.cleanupFailures!==0)throw Error('Tile isolation/retirement required')
  if(!Array.isArray(v)||!Array.isArray(t)||v.length<1||v.length>2||new Set(v.map(x=>x.shaderSHA)).size!==v.length||v.some(x=>!x.staticCache||!(x.shaderBytes>0)||!Number.isInteger(x.encoded)||x.encoded<=0||![plainSHA,...enabled?[tileSHA]:[]].includes(x.shaderSHA))||v.reduce((n,x)=>n+x.encoded,0)!==count)throw Error('Exact plain/tile cumulative dispatch count required')
  if(!enabled){if(t.length||v.length!==1||v[0].shaderSHA!==plainSHA)throw Error('OFF must consume only plain factor')}
  else{if(t.length!==1||t[0].shaderSHA!==tileSHA||!(t[0].shaderBytes>0)||!Number.isInteger(t[0].encoded)||t[0].encoded<=0||![t[0].stride1,t[0].stride2].every(n=>Number.isInteger(n)&&n>=0)||t[0].encoded!==t[0].stride1+t[0].stride2||v.find(x=>x.shaderSHA===tileSHA)?.encoded!==t[0].encoded)throw Error('Actual tile SHA/stride consumption required')}
 }
 return{variant:'factor cached shared tile',plainShaderSHA:plainSHA,tileShaderSHA:tileSHA,enabled,encodedFirstJob:240,tiledFirstJob:roles[0].frontSharedTileVariants[0]?.encoded??0}
}

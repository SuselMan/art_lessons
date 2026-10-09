const hex=value=>/^[a-f0-9]{64}$/.test(value??'')
/** Selected constructor pathways consume exact objects; unused compiled recipes remain valid. */
export function assertSourcePrepared({markers,readyAt,enabled,diagnostics,expected,source,expectedSource}){
 if(!enabled||source!==expectedSource||!/^[a-f0-9]{40}$/.test(source??'')||!Array.isArray(expected)||expected.length!==15||new Set(expected.map(x=>x.key)).size!==15)throw Error('Source preparation exact source/recipe passport invalid')
 const rows=markers.filter(x=>x.stage==='source-precompile:completed')
 if(rows.length!==1||!(rows[0].at<=readyAt))throw Error('Exact source preparation not before READY')
 const p=rows[0].proof
 if(p?.dispatches!==0||p?.fieldBytes!==0||!Array.isArray(p.resourceBefore)||JSON.stringify(p.resourceBefore)!==JSON.stringify(p.resourceAfter)||p.proofs?.length!==15)throw Error('Preparation changes dispatch or persistent fields')
 if(p.proofs.filter(x=>x.kind==='render').length!==12||p.proofs.filter(x=>x.kind==='compute').length!==3)throw Error('Recipe taxonomy differs')
 for(const e of expected){const matching=p.proofs.filter(x=>x.key===e.key);if(matching.length!==1)throw Error('Exact recipe missing or duplicate');const x=matching[0];if(!x.completed||!hex(x.shaderSHA)||!hex(x.descriptorSHA)||x.shaderSHA!==e.shaderSHA||x.descriptorSHA!==e.descriptorSHA||x.kind!==e.kind||!(x.compilerWallMs>=0))throw Error('Shader or descriptor identity differs')}
 if(diagnostics?.length!==15||diagnostics.some(x=>!x.completed||x.hits!==0)||new Set(diagnostics.map(x=>x.key)).size!==15||diagnostics.some(x=>!expected.some(e=>e.key===x.key)))throw Error('Factories used before actual input')
 return p
}
export function assertSourceConsumed(diagnostics,requiredKeys,expectedKeys){
 if(!Array.isArray(expectedKeys)||expectedKeys.length!==15||new Set(expectedKeys).size!==15||diagnostics?.length!==15||new Set(diagnostics.map(x=>x.key)).size!==15||diagnostics.some(x=>!expectedKeys.includes(x.key)))throw Error('Consumed exact prepared key set differs')
 if(!Array.isArray(requiredKeys)||!requiredKeys.length||new Set(requiredKeys).size!==requiredKeys.length||requiredKeys.some(k=>!expectedKeys.includes(k)))throw Error('Explicit selected recipe subset required')
 for(const key of requiredKeys){const rows=diagnostics?.filter(x=>x.key===key);if(rows?.length!==1||!rows[0].completed||!(rows[0].hits>=1))throw Error('Selected exact factory was not consumed: '+key)}
 if(diagnostics.some(x=>!x.completed||!(x.hits>=0)))throw Error('Invalid remaining prepared entries')
 return diagnostics.filter(x=>requiredKeys.includes(x.key))
}

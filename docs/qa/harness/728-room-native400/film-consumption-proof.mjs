/** Alternate actual variant proof, never claim original prepared front was consumed. */
export function assertFilmObservedConsumed(census,roles,expected){
 const rows=census.observedFields
 if(!census.actualObservedEnabled||rows?.length!==2||rows.some(x=>!x.completed)||rows.find(x=>x.kind==='waterFront')?.hits!==0||rows.find(x=>x.kind==='diffuse')?.hits!==1)throw Error('Film must bypass original front and consume original diffuse exactly')
 if(!Array.isArray(roles)||roles.length!==2||!expected||!['plain','cached'].every(k=>/^[a-f0-9]{64}$/.test(expected[k])))throw Error('Actual film shader passport required')
 for(const [i,role]of roles.entries()){const variants=role.filmVariant;if(role.frontFilmHoist!==true||variants?.length!==2||new Set(variants.map(x=>x.staticCache)).size!==2)throw Error('Both actual cached and fallback film variants required');for(const v of variants)if(v.shaderSHA!==expected[v.staticCache?'cached':'plain']||!Number.isInteger(v.shaderBytes)||v.shaderBytes<=0||v.encoded!==(i+1)*(v.staticCache?216:24))throw Error('Exact actual film shader/dispatch consumption differs')}
 return{observed:rows,variant:'actual film front replaces prepared original front',shaderSHAs:expected,encodedFirstJob:240}
}

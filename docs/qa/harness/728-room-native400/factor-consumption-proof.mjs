export function assertFactorObservedConsumed(census,roles,expected){
 const rows=census.observedFields
 if(!census.actualObservedEnabled||rows?.length!==2||rows.some(x=>!x.completed)||rows.find(x=>x.kind==='waterFront')?.hits!==0||rows.find(x=>x.kind==='diffuse')?.hits!==1)throw Error('Factor must replace original front, preserve diffuse')
 if(!Array.isArray(roles)||roles.length!==2||!/^[a-f0-9]{64}$/.test(expected??''))throw Error('Factor actual shader passport required')
 for(const [i,r]of roles.entries()){const v=r.factorVariant;if(r.frontCacheFactor!==true||r.frontFilmHoist||v?.length!==1||v[0].staticCache!==true||v[0].shaderSHA!==expected||!(v[0].shaderBytes>0)||v[0].encoded!==(i+1)*240||r.cache?.fallbacks!==0)throw Error('Exact factor SHA/240 cached dispatch consumption required')}
 return{variant:'factor cached front replaces original',shaderSHA:expected,encodedFirstJob:240}
}

export function assertObservedReady(markers,census,expected){
 const rows=markers.filter(m=>m.stage==='observed-fields-async:completed')
 if(rows.length!==1||!census.actualObservedEnabled)throw Error('Observed compile absent before READY')
 const p=JSON.parse(rows[0].values?.[0]??'null')
 if(p?.dispatches!==0||p.fieldBytes!==0||p.proofs?.length!==2||p.shaderSHAs?.length!==2)throw Error('Observed compile scope invalid')
 for(let i=0;i<2;i++){
  if(p.proofs[i].kind!==['waterFront','diffuse'][i]||p.shaderSHAs[i]!==expected[i]||!(p.proofs[i].compilerWallMs>=0))throw Error('Observed exact shader descriptor mismatch')
 }
 if(census.observedFields?.length!==2||census.observedFields.some(x=>!x.completed||x.hits!==0))throw Error('Observed factories used before actual input')
 return p
}
export function assertObservedConsumed(census){
 const rows=census.observedFields
 if(!census.actualObservedEnabled||rows?.length!==2||rows.some(x=>!x.completed||x.hits!==1)||!rows.some(x=>x.kind==='waterFront')||!rows.some(x=>x.kind==='diffuse'))throw Error('Observed prepared pipelines not consumed exactly once')
 return rows
}

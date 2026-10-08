/** No model claim: a readonly GL publication must not alter native material. */
export function auditReadonlyPublication(records){
 const failures=[],roles=['P','C','inkBase','colorBase','strokeInk','strokeColor','inkSettled','colorSettled']
 if(records?.length!==3)return{valid:false,failures:['Three bounded held contacts required']}
 for(let i=0;i<records.length;i++){
  const r=records[i],by=new Map(r.stages.map(x=>[x.stage,x]));if(!r.published)failures.push(`contact${i}: publication did not succeed`)
  for(const role of [...roles,...(r.sourceMetadata?.waterHistory?['solventLoad','foreignSolventLoad']:[])]){const before=by.get('source-'+role),after=by.get('post-'+role);if(!before||!after||before.absent!==after.absent||(!before.absent&&(!before.sha||before.sha!==after.sha)))failures.push(`contact${i}: ${role} changed or unobserved`)}
 }
 return{valid:!failures.length,failures,scope:'Cropped eight native material/base/film/settled roles before and after readonly GL publication; no mass/physical transport claim'}
}

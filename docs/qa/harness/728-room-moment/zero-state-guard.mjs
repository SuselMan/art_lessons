export function compareZeroStateStages(records,reference){
 const failures=[]
 if(records?.length!==3||reference?.length!==3)return{valid:false,failures:['Three actual contacts required']}
 for(let i=0;i<3;i++){
  const r=records[i],old=reference[i],by=new Map(r.stages.map(s=>[s.stage,s]))
  if(JSON.stringify(r.operatorRect)!==JSON.stringify(old.operatorRect)||JSON.stringify(r.capture)!==JSON.stringify(old.capture))failures.push(`contact${i}: crop mismatch`)
  for(const role of ['P','C','inkBase','colorBase','strokeInk','strokeColor'])if(by.get('source-'+role)?.sha!==by.get('post-'+role)?.sha||!by.has('source-'+role)||!by.has('post-'+role))failures.push(`contact${i}: ${role} state changed`)
  for(const [source,prior] of [['source-P','source-P'],['source-C','source-C'],['presentation-after-sourcepublish','presentation-after-sourcepublish']])if(by.get(source)?.sha!==old.stages.find(s=>s.stage===prior)?.sha)failures.push(`contact${i}: OFF ${source} mismatch`)
 }
 return{valid:failures.length===0,failures,scope:'Actual cropped six-field pre/post zero-state and same-tape OFF source/display, not whole-field parity'}
}

export function compareColourSnapshot(a,b,scenario){
 const fields=x=>x.fields?.records?.map(({key,role,width,height,channels,byteLength,nonzero,max,sum,sha256})=>({key,role,width,height,channels,byteLength,nonzero,max,sum,sha256}))
 const meaningful=a.fields?.coverage?.nonemptyRequiredRoles===true&&b.fields?.coverage?.nonemptyRequiredRoles===true&&a.materialWholeLayer?.length>0&&b.materialWholeLayer?.length>0
 const result={scenario,meaningful,fieldsExact:JSON.stringify(fields(a))===JSON.stringify(fields(b)),materialExact:JSON.stringify(a.materialWholeLayer)===JSON.stringify(b.materialWholeLayer),exportExact:a.rgbaSha256===b.rgbaSha256,tapeExact:a.tapeSha256===b.tapeSha256,exercised:scenario==='single400'?b.colourSnapshot.skipped>0:b.colourSnapshot.skipped===0}
 return{...result,valid:meaningful&&result.fieldsExact&&result.materialExact&&result.exportExact&&result.tapeExact&&result.exercised&&[a,b].every(x=>x.glError===0&&!x.lost)}
}
/** Same source bundle, serial fresh ownership, readback outside paint boundary. */
export async function runColourSnapshot(engine,{scenarios=['single400','mixed400'],backend='webgl1',onArm=()=>{}}={}){
 const rows=[]
 try{
  for(const scenario of scenarios){const arms=[]
   for(const enabled of [false,true]){
    try{const report=await engine.runPrototype({backend,scenario,paper:'fine',pageWidth:2048,skipSinglePaintColourSnapshot:enabled,verifyUndo:false});arms.push(report);await onArm({scenario,enabled,report})}finally{engine.disposePrototype()}
   }
   rows.push({...compareColourSnapshot(...arms,scenario),arms})
  }
  return{valid:rows.every(x=>x.valid),rows}
 }finally{engine.disposePrototype()}
}

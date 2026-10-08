import {GpuMethodTimer} from '../728-gpu-method-timer/timer.mjs'
export function compareColourSnapshot(a,b,scenario,expectedSkip=scenario==='single400'?'positive':'zero'){
 const fields=x=>x.fields?.records?.map(({key,role,width,height,channels,byteLength,nonzero,max,sum,sha256})=>({key,role,width,height,channels,byteLength,nonzero,max,sum,sha256}))
 const meaningful=a.fields?.coverage?.nonemptyRequiredRoles===true&&b.fields?.coverage?.nonemptyRequiredRoles===true&&a.materialWholeLayer?.length>0&&b.materialWholeLayer?.length>0
 const result={scenario,meaningful,fieldsExact:JSON.stringify(fields(a))===JSON.stringify(fields(b)),materialExact:JSON.stringify(a.materialWholeLayer)===JSON.stringify(b.materialWholeLayer),exportExact:a.rgbaSha256===b.rgbaSha256,tapeExact:a.tapeSha256===b.tapeSha256,exercised:expectedSkip==='positive'?b.colourSnapshot.skipped>0:b.colourSnapshot.skipped===0}
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

/** Hardware cohort wall order is OFF/ON/ON/OFF; query instrumentation separate. */
export async function runColourSnapshotArm(engine,{enabled=false,gpu=false}={}){
 let timer,raf=0
 const poll=()=>{timer?.poll();raf=requestAnimationFrame(poll)}
 try{
  const report=await engine.runPrototype({backend:'webgl1',scenario:'single400',paper:'fine',pageWidth:2048,skipSinglePaintColourSnapshot:enabled,verifyUndo:false,
   onPaintPhase(phase,probe){
    if(!gpu)return
    if(phase==='start'){timer=new GpuMethodTimer(probe.gl,{everyNth:1,maxPending:256});timer.wrap(engine.AccumulationBuffer.prototype,['copyTo']);raf=requestAnimationFrame(poll)}
    else for(const restore of timer?.restores.splice(0)??[])restore()
   }})
  const deadline=performance.now()+15000
  while(timer?.pending.length&&performance.now()<deadline){timer.poll();await new Promise(r=>setTimeout(r,16))}
  timer?.poll();return{enabled,gpu,report,timer:timer?.report()??null}
 }finally{cancelAnimationFrame(raf);timer?.dispose();engine.disposePrototype()}
}

import {GpuMethodTimer} from '../728-gpu-method-timer/timer.mjs'
import {compareRuns,gpuSummary} from '../728-gpu-method-timer/parity.mjs'
const arms=[{backend:'webgl1',schedule:'baseline'},{backend:'mrt',schedule:'baseline'},{backend:'mrt',schedule:'front'},{backend:'webgl1',schedule:'front'}]
/** Actual full engine wall cohort is uninstrumented. GPU sampling is a separate cohort. */
export async function runFactorial(engine,{gpu=true}={}){
 const wall=[],queries=[];let baseline
 try{
  for(const [cycle,order] of [arms,[...arms].reverse()].entries())for(const arm of order){
   const report=await engine.runPrototype({...arm,scenario:'zigzag',paper:'fine'})
   baseline??=report
   const quality=compareRuns(baseline,report)
   if(arm.backend==='mrt'&&!(report.mrt?.pairs>0))quality.valid=false
   const fieldQuality=compareFields(baseline.fields,report.fields)
   wall.push({cycle,arm,report,quality,fieldQuality})
   engine.disposePrototype()
   if(!quality.valid||!fieldQuality.valid) return {valid:false,wall,queries,reason:'Full engine quality gate failed',limitations}
  }
  if(gpu)for(const arm of arms){
   let timer,raf=0
   const poll=()=>{timer?.poll();raf=requestAnimationFrame(poll)}
   try{
    const report=await engine.runPrototype({...arm,scenario:'zigzag',paper:'fine',onPaintPhase(phase,value){
     if(phase==='start'){timer=new GpuMethodTimer(value.gl,{everyNth:1,maxPending:256});timer.wrap(value._watercolorPasses,arm.backend==='mrt'?['brushPair','brush']:['brush']);raf=requestAnimationFrame(poll)}
     else for(const restore of timer?.restores.splice(0)??[])restore()
    }})
    // Completion poll is outside paint timing and does not force synchronous GPU waits.
    const deadline=performance.now()+15000
    while(timer?.pending.length&&performance.now()<deadline){timer.poll();await new Promise(r=>setTimeout(r,16))}
    timer?.poll();queries.push({arm,report,timer:timer?.report(),summary:gpuSummary(timer?.rows??[]),quality:compareRuns(baseline,report),fieldQuality:compareFields(baseline.fields,report.fields)})
   }finally{cancelAnimationFrame(raf);timer?.dispose();engine.disposePrototype()}

  }
  return {valid:wall.every(x=>x.quality.valid&&x.fieldQuality.valid)&&queries.every(x=>x.quality.valid&&x.fieldQuality.valid),wall,queries,limitations}
 }finally{engine.disposePrototype()}
}
export function compareFields(a,b){
 const records=x=>x?.records?.map(({key,role,width,height,channels,byteLength,nonzero,max,sum,sha256})=>({key,role,width,height,channels,byteLength,nonzero,max,sum,sha256}))
 const same=JSON.stringify(records(a))===JSON.stringify(records(b))
 return{valid:same&&a?.coverage?.nonemptyRequiredRoles===true&&b?.coverage?.nonemptyRequiredRoles===true,sameRecords:same,coverage:[a?.coverage,b?.coverage]}
}
const limitations=['No Room/server/network/pen-to-visible or power forecast','Wall cohort has no queries; paintMs excludes verification/export/Undo readbacks','Query cohort instrumentation changes CPU submission timing; not a wall benchmark','GPU queries wrap only paint phase; verification/export/Undo/Redo excluded','brushPair and brush are disjoint outer queries; pair samples process P/C together, singles process one field','First full arm includes cold compiler effects; retain forward/reverse individual values, no isolated42% whole claim']

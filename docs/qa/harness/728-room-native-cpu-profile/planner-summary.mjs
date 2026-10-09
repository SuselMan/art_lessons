export function summarizePlannerQuanta(markers){
 const starts=new Map(markers.map((e,index)=>({...e,index})).filter(e=>e.stage==='planner.quantum:start').map(e=>[e.id,e]))
 const quanta=markers.map((e,index)=>({...e,index})).filter(e=>e.stage==='planner.quantum:end').map(e=>{const start=starts.get(e.id);if(!start||e.ms<start.ms)throw Error('Invalid planner quantum marker pair');return{id:e.id,startMs:start.ms,endMs:e.ms,wallCpuMs:e.wallCpuMs,passes:e.passes,passOverflow:e.passOverflow,outcome:e.outcome,queueSubmitIds:markers.slice(start.index+1,e.index).filter(s=>s.stage==='queue.submit:start').map(s=>s.id),queueCompletionIds:markers.slice(start.index+1,e.index).filter(s=>s.stage==='queue.completion:start').map(s=>s.id)}})
 const pipelines=markers.filter(e=>e.stage==='pipeline.create:end').map(e=>({id:e.id,kind:e.kind,endMs:e.ms,wallCpuMs:e.wallCpuMs,outcome:e.outcome}))
 return{quanta,pipelines,scope:'CPU encode/descriptor wall and ordered submission identifiers; not GPU durations or exclusive queue completion cost. Backend eager pipelines before create-return observer are absent.'}
}

export function summarizePlannerQuanta(markers){
 const starts=new Map(markers.filter(e=>e.stage==='planner.quantum:start').map(e=>[e.id,e])),submits=markers.filter(e=>e.stage==='queue.submit:start')
 const quanta=markers.filter(e=>e.stage==='planner.quantum:end').map(e=>{const start=starts.get(e.id);if(!start||e.ms<start.ms)throw Error('Invalid planner quantum marker pair');return{id:e.id,startMs:start.ms,endMs:e.ms,wallCpuMs:e.wallCpuMs,passes:e.passes,passOverflow:e.passOverflow,outcome:e.outcome,queueSubmitIds:submits.filter(s=>start.ms<=s.ms&&s.ms<=e.ms).map(s=>s.id)}})
 const pipelines=markers.filter(e=>e.stage==='pipeline.create:end').map(e=>({id:e.id,kind:e.kind,endMs:e.ms,wallCpuMs:e.wallCpuMs,outcome:e.outcome}))
 return{quanta,pipelines,scope:'CPU encode/descriptor wall and ordered submission identifiers; not GPU durations or exclusive queue completion cost. Backend eager pipelines before create-return observer are absent.'}
}

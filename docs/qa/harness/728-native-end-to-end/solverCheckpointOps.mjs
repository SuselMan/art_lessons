/** QA-only operator boundary snapshots. Copies run inside the original quantum,
 * never read pixels there, never replace inputs, and preserve original order. */
export function installSolverCheckpointOps(planner,{indices,getField,clone,rolesForIndex=()=>['a','ca']}) {
 if(!indices.length||new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||i<0))throw Error('Explicit unique operator indices required')
 const original=planner.prepare,captures=[];let calls=0
 planner.prepare=function(...args){
  if(++calls!==1)throw Error('Single solver job required')
  const job=original.apply(this,args);if(!job)throw Error('Actual solver job missing')
  if(indices.some(i=>i>=job.ops.length))throw Error('Checkpoint outside actual job')
  for(const index of indices){const operation=job.ops[index];job.ops[index]=()=>{operation();const field=getField();if(!field||field.w!==1536||field.h!==1536)throw Error('Actual1536 field required');const roles=rolesForIndex(index);if(!roles.length||roles.some(role=>!['a','b','c','ca','cb','cc'].includes(role)))throw Error('Explicit pigment/color checkpoint roles required');captures.push({index,...Object.fromEntries(roles.map(role=>[role,clone(field[role])]))})}}
  return job
 }
 return{captures,get calls(){return calls},detach(){planner.prepare=original}}
}

/** Check the actual encoded quantum BEFORE queue.submit, not the recipe label alone. */
export function assertSelectedFieldQuantum(q){
 const modes=[11,1,6,5,5,5,5,5,5]
 if(!q||q.overflow||q.passes?.length!==modes.length||q.passes.some((p,i)=>p.family!=='fieldOp'||p.mode!==modes[i]))throw Error('Selected op62 must encode exact field11/1/6/5x6 before submit')
 return{quantumId:q.id,passes:q.passes.map(p=>({...p})),source:'Actual CanonicalPlanAdapter.runQuantum fieldOp order, checked before submit; uniforms remain original immutable recipe'}
}

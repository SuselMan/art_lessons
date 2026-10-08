/** Explicit source effectiveness, never infer transport from native/display alone. */
export function momentEffectiveness(enabled,census,chunks){
 if(!enabled)return{valid:true,outcome:'reference-OFF',reports:0}
 if(!census.momentEnabled)throw Error('Requested moment flag did not reach actual engine')
 const reports=census.momentReport
 if(!Array.isArray(reports)||!reports.length)throw Error('No actual moment source report; native-only is not transport PASS')
 if(!Array.isArray(chunks)||chunks.length!==reports.length||chunks.some((c,i)=>c.ordinal!==reports[i].ordinal||!c.recipe||!Number.isInteger(c.recipe.ordinal)||![c.recipe.x256,c.recipe.y256,c.recipe.pressure256].every(Number.isInteger)))throw Error('Moment recipes/ordinals do not match actual retained source callbacks')
 if(reports.some(r=>!r.supported))return{valid:false,outcome:'unsupported-actual-carrier',reports:reports.length,unsupported:reports.filter(r=>!r.supported)}
 if(reports.some(r=>!r.applied))throw Error('Supported moment source was not actually applied')
 return{valid:true,outcome:'applied-actual-source',reports:reports.length}
}

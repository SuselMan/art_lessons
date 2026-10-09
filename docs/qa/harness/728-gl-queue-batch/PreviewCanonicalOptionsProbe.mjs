/** Passive CPU-only original prepare attribution. No GPU reads, source changes or timing claims. */
export function installPreviewCanonicalOptionsProbe(engine,{limit=8}={}){
 const plan=engine._settlePlan;if(!plan||typeof plan.prepare!=='function'||!Number.isInteger(limit)||limit<1||limit>8)throw Error('Bounded actual settle plan required');const original=plan.prepare,rows=[];
 const wrapper=function(...args){if(rows.length<limit){const [,targets,bounds,bloom=0,radiusPx=16,water=1,landedWet=0,standing=1,wetPeak=0,dwellMs=0]=args;rows.push({bounds:bounds?{...bounds}:null,targets:targets?.length??null,bloom,radiusPx,water,landedWet,standing,wetPeak,dwellMs})}return original.apply(this,args)};plan.prepare=wrapper;let stopped=false;return{rows,stop(){if(stopped)return;stopped=true;if(plan.prepare!==wrapper)throw Error('Prepare probe ownership changed');plan.prepare=original}};
}

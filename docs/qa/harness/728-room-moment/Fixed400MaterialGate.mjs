/** Fail closed without rewriting IDs, seeds, timestamps, payloads or wetness. */
export function fixed400MaterialGate(rows){
 if(rows.length!==2)return{complete:false,equal:false,mismatches:['missing-arm'],scope:'Raw material input, not pixels or physical latency'};
 const complete=rows.every(r=>r.fixedInput===true&&r.authored?.length===2&&r.sourceSeeds?.length===2&&r.sourceSeeds.every(s=>typeof s.strokeId==='string'&&Array.isArray(s.seed)&&s.seed.length===2&&s.seed.every(Number.isFinite))&&r.tape?.length===2&&r.tape.every(o=>typeof o.strokeId==='string'&&typeof o.preset==='string'&&Array.isArray(o.color)&&typeof o.dabsPacked==='string'&&o.dabsPacked.length>0));
 if(!complete)return{complete:false,equal:false,mismatches:['incomplete-input'],scope:'Raw material input, not pixels or physical latency'};
 const pick=r=>({authored:r.authored,seeds:r.sourceSeeds,strokes:r.tape.map(o=>({strokeId:o.strokeId,preset:o.preset,color:o.color,dabsPacked:o.dabsPacked,wet:o.wet??null}))});
 const a=pick(rows[0]),b=pick(rows[1]);const mismatches=Object.keys(a).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k]));
 return{complete:true,equal:mismatches.length===0,mismatches,scope:'Strict raw authored/source seeds/packed/wet equality; no normalization, no pixel oracle'};
}

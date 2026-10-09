/** Fail closed without rewriting IDs, seeds, timestamps, payloads or wetness. */
export function fixed400MaterialGate(rows){
 if(rows.length!==2)return{complete:false,equal:false,mismatches:['missing-arm'],scope:'Raw material input, not pixels or physical latency'};
 const pick=r=>({authored:r.authored,seeds:r.sourceSeeds,strokes:r.tape.map(o=>({strokeId:o.strokeId,preset:o.preset,color:o.color,dabsPacked:o.dabsPacked,wet:o.wet??null}))});
 const a=pick(rows[0]),b=pick(rows[1]);const mismatches=Object.keys(a).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k]));
 return{complete:true,equal:mismatches.length===0,mismatches,scope:'Strict raw authored/source seeds/packed/wet equality; no normalization, no pixel oracle'};
}

/** Reject instrument-invalid/different-input runs before scientific attribution. */
export function compareSourceContribution(baseline,after44){
 const unwrap=(raw,expected)=>{
  if(!raw.valid||raw.stage!=='complete'||raw.rows.length!==1||raw.errors.length)throw Error('Invalid hardware cohort')
  const result=raw.rows[0].report,oracle=result.oracle
  if(result.code!==raw.code||raw.provenance.code!==raw.code||oracle.errors.length||oracle.validation||oracle.commands!==145||JSON.stringify(oracle.substitutions)!==JSON.stringify(expected))throw Error('Source cohort passport/scope differs')
  if(JSON.stringify(oracle.rows.map(r=>r.index))!==JSON.stringify([37,44,144])||oracle.readbackBytes!==25165824)throw Error('Unexpected checkpoint/traffic scope')
  return{raw,result,oracle}
 }
 const a=unwrap(baseline,[]),b=unwrap(after44,[44])
 for(const key of ['runJsSha256','code'])if(a.raw[key]!==b.raw[key])throw Error('Frozen source differs')
 for(const key of ['operationSha256','paperSha256'])if(a.result[key]!==b.result[key])throw Error('Input differs')
 if(JSON.stringify(a.result.sourceCommands)!==JSON.stringify(b.result.sourceCommands))throw Error('Prepared command manifest differs')
 for(let i=0;i<3;i++)if(a.oracle.rows[i].glSha256!==b.oracle.rows[i].glSha256)throw Error('GL reference changed')
 for(let i=0;i<2;i++)if(a.oracle.rows[i].nativeSha256!==b.oracle.rows[i].nativeSha256)throw Error('Pre-substitution native sequence changed')
 const old=a.oracle.rows[2].comparisonBeforeSubstitution,next=b.oracle.rows[2].comparisonBeforeSubstitution
 return{scope:'Cumulative source coverage before44 reset; not FBM-only or full material/Room gain',baseline:old,after44:next,changedBytesRemoved:old.changed-next.changed,changedByteReduction:old.changed?(old.changed-next.changed)/old.changed:null,finalGlSha256:a.oracle.rows[2].glSha256}
}

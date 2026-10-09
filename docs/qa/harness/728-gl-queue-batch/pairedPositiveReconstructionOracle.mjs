/** Synthetic proof/counterexample only, not actual GPU attribution. */
export function comparePairedReconstructions(){
 const mass=[1,0,0,0],delta=[-.25,-.15,.15,.25],tau=[.7,1.4,.35],base=mass.map(m=>[m,m,m,m,...tau.map(t=>m*t/4),m]),change=delta.map(m=>[m,m,m,m,...tau.map(t=>m*t/4),m]);
 const limit=(b,d)=>Math.min(1,...d.map((v,i)=>v<0?b[i]/-v:1));
 const lambda=base.map((b,i)=>limit(b,change[i])),global=Math.min(...lambda);
 const reconstruct=kind=>base.map((b,i)=>b.map((v,k)=>kind==='clip'?Math.max(0,v+change[i][k]):v+(kind==='local'?lambda[i]:global)*change[i][k]));
 const metrics=v=>({mass:v.reduce((n,r)=>n+r[7],0),negative:v.flat().filter(v=>v<0).length,channels:Array.from({length:8},(_,k)=>v.reduce((n,r)=>n+r[k],0)),hueRatios:v.map(r=>r[7]>0?r.slice(4,7).map(v=>v*4/r[7]):null)});
 // Common column-stochastic transport; all eight original channels share weights.
 const column=[.75,.05,.10,.10],transport=column.map(w=>base[0].map(v=>v*w));
 const identity=base.map(r=>r.slice());
 return{scope:'Synthetic four-pixel high source, zero-sum low residual; not actual retained highFloat128',input:{mass,delta,lambda,globalLambda:global,tau},clip:metrics(reconstruct('clip')),localLambda:metrics(reconstruct('local')),globalLambda:metrics(reconstruct('global')),commonTransport:metrics(transport),identityExact:identity.every((r,i)=>r.every((v,k)=>v===base[i][k])),limitations:['Local lambda does not conserve mass; global lambda can freeze the entire scene','Same lambda preserves a single colour only when P/C delta already has consistent ratios; quantized multicolour delta does not guarantee that','Column-stochastic shared transport preserves positivity/channel mass and keeps colour ratios in donor convex hull','This matrix is a witness, not a derived velocity field or practical GPU algorithm']};
}
if(process.argv[1]?.endsWith('pairedPositiveReconstructionOracle.mjs'))console.log(JSON.stringify(comparePairedReconstructions(),null,2));

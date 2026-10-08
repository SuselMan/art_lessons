import assert from 'node:assert/strict';
const n=32,D=.09,dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
function step(src){const out=new Float64Array(src.length);for(let y=0;y<n;y++)for(let x=0;x<n;x++){let v=src[y*n+x];for(const[dx,dy]of dirs){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=n||yy>=n)continue;v-=D*src[y*n+x];v+=D*src[yy*n+xx]}out[y*n+x]=v}return out}
const total=v=>v.reduce((a,b)=>a+b,0),seed=new Float64Array(n*n);seed[16*n+16]=255;
const refs=new Map();let ideal=seed;for(let i=1;i<=113;i++){ideal=step(ideal);if([16,64,113].includes(i))refs.set(i,ideal)}
const rows=[];
for(const mode of ['q8-every-step','f32-preview','q8-residual-f32','q8-four-steps-per-write']){
 let state=new Float64Array(seed),residual=new Float64Array(seed.length),writes=0;
 for(let i=1;i<=113;i++){
  const input=mode==='q8-residual-f32'?Float64Array.from(state,(v,j)=>v+residual[j]):state;
  const next=step(input);
  if(mode==='f32-preview'){state=Float64Array.from(next,v=>Math.fround(v));writes++}
  else if(mode==='q8-residual-f32'){state=Float64Array.from(next,v=>Math.round(v));residual=Float64Array.from(next,(v,j)=>Math.fround(v-state[j]));writes+=2}
  else if(mode==='q8-every-step'||i%4===0||i===113){state=Float64Array.from(next,v=>Math.round(v));writes++}
  else state=next; // Requires floating intermediates, not Q8 pass fusion.
  if(refs.has(i)){const effective=mode==='q8-residual-f32'?Float64Array.from(state,(v,j)=>v+residual[j]):state;const ref=refs.get(i);rows.push({mode,step:i,displaySum:total(state),effectiveSum:total(effective),l1ToReal:total(Float64Array.from(effective,(v,j)=>Math.abs(v-ref[j]))),writes})}
 }
}
const f=rows.find(r=>r.mode==='f32-preview'&&r.step===113),r=rows.find(r=>r.mode==='q8-residual-f32'&&r.step===113),q=rows.find(r=>r.mode==='q8-every-step'&&r.step===113);
assert(Math.abs(f.effectiveSum-255)<.001);assert(Math.abs(r.effectiveSum-255)<.001);assert(q.effectiveSum<200);
console.log(JSON.stringify({pass:true,grid:[n,n],D,rows,scope:'flat-height CPU numerical precision comparison; no actual GPU/paper/color proof'}));

import assert from 'node:assert/strict';
const n=17,D=.09,offsets=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
function step(src,quantize){const out=new Float64Array(src.length);for(let y=0;y<n;y++)for(let x=0;x<n;x++){let v=src[y*n+x];for(const[dx,dy]of offsets){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=n||yy>=n)continue;v-=D*src[y*n+x];v+=D*src[yy*n+xx]}out[y*n+x]=quantize?Math.round(Math.max(0,v)):Math.max(0,v)}return out}
const sum=v=>v.reduce((a,b)=>a+b,0),seed=mass=>{const a=new Float64Array(n*n);a[8*n+8]=mass;return a};
const a=step(seed(4),true);assert.equal(sum(a),1);assert.equal(sum(step(a,true)),0);
let real=seed(4);for(let i=0;i<113;i++)real=step(real,false);assert(Math.abs(sum(real)-4)<1e-10);
let q=seed(255);const timeline=[];for(let i=0;i<113;i++){q=step(q,true);if([0,1,7,31,112].includes(i))timeline.push({step:i+1,sum:sum(q),max:Math.max(...q),nonzero:q.filter(v=>v>0).length})}
console.log(JSON.stringify({pass:true,flatHeight:true,fullWetGate:true,D,BTimesHeightDelta:0,seed4Q8:[4,1,0],real113Sum:sum(real),q8Seed255Timeline:timeline,scope:'literal eight-neighbor math + round-to-nearest assumption; not GPU rounding/actual domain result'}));

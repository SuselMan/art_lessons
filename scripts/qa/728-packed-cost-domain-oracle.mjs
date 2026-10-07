import assert from 'node:assert/strict';
const w=129,h=5,N=w*h,dirs=[[1,0],[-1,0],[0,1],[0,-1]];
let seed=84729,comparisons=0;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)>>>24);
const unorm=n=>Math.round(Math.fround(Math.fround(n/255)*255));
for(let n=0;n<=127;n++)assert.equal(unorm(n),n);
for(let trial=0;trial<40;trial++){
 const costs=Uint8Array.from({length:N},random),band=random(),ok=Uint8Array.from(costs,c=>c<=band);
 const inside=(x,y)=>x>=0&&x<w&&y>=0&&y<h;
 let packed=new Uint8Array(4*N);
 for(let i=0;i<N;i++)for(let k=0;k<4;k++){const x=i%w+dirs[k][0],y=(i/w|0)+dirs[k][1];packed[4*i+k]=inside(x,y)&&ok[i]&&ok[y*w+x]?1:0;}
 for(let distance=1;distance<64;distance*=2){const next=packed.slice();for(let i=0;i<N;i++)for(let k=0;k<4;k++){const x=i%w+dirs[k][0]*distance,y=(i/w|0)+dirs[k][1]*distance;if(inside(x,y))next[4*i+k]+=2*distance*((packed[4*i+k]/distance|0)%2)*((packed[4*(y*w+x)+k]/distance|0)%2);}packed=next;}
 for(let stride=1;stride<=64;stride*=2)for(let i=0;i<N;i++)for(let k=0;k<4;k++){let expected=1;for(let n=0;n<=stride;n++){const x=i%w+dirs[k][0]*n,y=(i/w|0)+dirs[k][1]*n;if(!inside(x,y)||!ok[y*w+x]){expected=0;break;}}assert.equal((unorm(packed[4*i+k])/stride|0)%2,expected);comparisons++;}
}
console.log(JSON.stringify({comparisons,unormCodes:128,levels:7,precision:'Float32 UNORM roundtrip; literal inclusive paths; exterior zero',GPU:false}));

import assert from'node:assert/strict';
const w=129,h=5,N=w*h,dirs=[[1,0],[-1,0],[0,1],[0,-1]];let seed=84729;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)>>>24);
function base(v,allowed){const a=new Uint8Array(4*N);for(let i=0;i<N;i++)if(allowed[i])a.fill(255,4*i,4*i+4);return a;}
function grow(a,s){const out=new Uint8Array(a.length);for(let i=0;i<N;i++)for(let k=0;k<4;k++){const x=i%w+dirs[k][0]*s,y=((i/w)|0)+dirs[k][1]*s;out[4*i+k]=x<0||x>=w||y<0||y>=h?0:Math.min(a[4*i+k],a[4*(y*w+x)+k]);}return out;}
function direct(v,allowed,i,k,s){const[dx,dy]=dirs[k];let m=255;for(let n=0;n<=s;n++){const x=i%w+dx*n,y=((i/w)|0)+dy*n;if(x<0||x>=w||y<0||y>=h||!allowed[y*w+x])return 0;m=255;}return m;}
let comparisons=0;for(let trial=0;trial<40;trial++){const v=Uint8Array.from({length:N},()=>random()),cost=Uint8Array.from({length:N},()=>random()),bandByte=random(),allowed=Uint8Array.from(cost,c=>c<=bandByte?1:0);let a=base(v,allowed);for(let s=1;s<=64;s*=2){a=grow(a,s===1?1:s/2);
 for(let i=0;i<N;i++)for(let k=0;k<4;k++){assert.equal(a[4*i+k],direct(v,allowed,i,k,s));comparisons++;}}}
const v=new Uint8Array(N).fill(255),allowed=new Uint8Array(N).fill(1);allowed[2*w+17]=0;let a=base(v,allowed);for(let s=1;s<=64;s*=2)a=grow(a,s===1?1:s/2);assert.equal(a[4*(2*w)+0],0);assert.equal(allowed[2*w],1);assert.equal(allowed[2*w+64],1);for(let n=1;n<8;n++)assert.equal(allowed[2*w+n*8],1);
console.log(JSON.stringify({comparisons,dry1px64Detected:true,endpointAnd7SparseSamplesWouldMiss:true,scope:'CPU binary immutable cost-domain inclusive reachability, no GPU/LINEAR precision/lifecycle claim'}));

for(const blocked of [0,64]){allowed.fill(1);allowed[2*w+blocked]=0;let b=base(v,allowed);for(let stride=1;stride<=64;stride*=2)b=grow(b,stride===1?1:stride/2);assert.equal(b[4*(2*w)],0);}
allowed.fill(1);let b=base(v,allowed);for(let stride=1;stride<=64;stride*=2)b=grow(b,stride===1?1:stride/2);assert.equal(b[4*(2*w+100)],0);assert.equal(b[4*(2*w)],255);console.log('Explicit blocked-start, blocked-end, out-of-bounds and connected path PASS');

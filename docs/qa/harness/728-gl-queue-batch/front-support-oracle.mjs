// CPU support theorem only: NOT GLSL arithmetic/GPU parity or a production ROI.
import assert from 'node:assert/strict';
let state=1729;const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32);
const results=[];let negative=0;
for(const w of[17,31,64])for(const stride of[1,2,4])for(let fixture=0;fixture<8;fixture++){
 const h=w-2,N=w*h,heights=Uint8Array.from({length:N},()=>Math.floor(random()*256));let rect=[3,4,Math.min(w-3,8),Math.min(h-2,9)];
 const source=new Uint8Array(N*4);for(let i=0;i<N;i++){source[i*4]=255;source[i*4+2]=0;source[i*4+3]=255}for(let y=rect[1];y<rect[3];y++)for(let x=rect[0];x<rect[2];x++)source[(y*w+x)*4]=Math.floor(random()*120);
 const sample=(a,x,y)=>{x=Math.min(w-1,Math.max(0,x));y=Math.min(h-1,Math.max(0,y));const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;const at=(u,v)=>a[(Math.min(h-1,v)*w+Math.min(w-1,u))*4]/255;return (at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy};
 const step=(src,dst,roi)=>{for(let y=roi[1];y<roi[3];y++)for(let x=roi[0];x<roi[2];x++){let best=src[(y*w+x)*4]/255;for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){const nx=x+dx*stride,ny=y+dy*stride;if(nx<0||ny<0||nx>=w||ny>=h)continue;const ci=sample(src,nx,ny);if(ci>=.999)continue;best=Math.min(best,ci+.03*Math.max(1,stride)+(dx&&dy?.01:0))}const k=(y*w+x)*4;dst[k]=Math.round(Math.min(best,1)*255);dst[k+1]=heights[y*w+x];dst[k+2]=src[k+2];dst[k+3]=255}};
 let full=[source.slice(),source.slice()],bounded=[source.slice(),source.slice()];for(let i=0;i<7;i++){const a=i%2,b=1-a;if(i<2){step(full[a],full[b],[0,0,w,h]);step(bounded[a],bounded[b],[0,0,w,h])}else{step(full[a],full[b],[0,0,w,h]);step(bounded[a],bounded[b],rect)}assert.deepEqual(bounded[b],full[b]);const r=stride+2;rect=[Math.max(0,rect[0]-r),Math.max(0,rect[1]-r),Math.min(w,rect[2]+r),Math.min(h,rect[3]+r)]}
 // Negative control: omitting expansion must fail for some nontrivial seed.
 const bad=source.slice(),good=source.slice();step(source,bad,[3,4,Math.min(w-3,8),Math.min(h-2,9)]);step(source,good,[0,0,w,h]);if(Buffer.compare(bad,good))negative++;
 results.push({w,h,stride,fixture,steps:7,exact:true});
}
assert(negative>0);console.log(JSON.stringify({scope:'CPU bounded-support theorem; synthetic nonnegative stencil, not production shader arithmetic',fixtures:results.length,steps:7,exact:true,negativeControlsDetected:negative}));

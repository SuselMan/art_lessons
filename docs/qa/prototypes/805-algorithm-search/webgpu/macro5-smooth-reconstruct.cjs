'use strict';
// Coarse values are fine-pixel means. No saturation: caller audits RGBA8 overflow.
function reconstruct(a,w,h,r,dry){
 if(![w,h,r].every(v=>Number.isSafeInteger(v)&&v>0)||a.length!==w*h*4)throw Error('dimensions');
 const W=w*r,H=h*r,o=new Float64Array(W*H*4);
 if(dry&&dry.length!==o.length)throw Error('dry dimensions');
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
 const qx=(x+.5)/r-.5,qy=(y+.5)/r-.5,bx=Math.floor(qx),by=Math.floor(qy),tx=qx-bx,ty=qy-by;
 for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
 const j=(Math.max(0,Math.min(h-1,by+dy))*w+Math.max(0,Math.min(w-1,bx+dx)))*4;
 const weight=(dx?tx:1-tx)*(dy?ty:1-ty);
 for(let c=0;c<4;c++)o[(y*W+x)*4+c]+=weight*a[j+c];
 }
 if(dry)for(let c=0;c<4;c++)o[(y*W+x)*4+c]+=dry[(y*W+x)*4+c];
 }return o;
}
function pair(a,b,t){if(!(t>=0&&t<=.5))throw Error('share');return[a.map((v,c)=>v+(b[c]-v)*t),b.map((v,c)=>v+(a[c]-v)*t)];}
module.exports={reconstruct,pair};

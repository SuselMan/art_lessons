'use strict';
// Real captured planes only. No solver, no generated intermediate illustrations.
const assert=require('node:assert/strict');
const {png}=require('../../harness/805-algorithm-search/fixed-reference.cjs');
function topDown(rgba,w,h){assert.equal(rgba.length,w*h*4);const source=Buffer.from(rgba.buffer,rgba.byteOffset,rgba.byteLength),out=Buffer.alloc(rgba.length);for(let y=0;y<h;y++)source.copy(out,(h-1-y)*w*4,y*w*4,(y+1)*w*4);return out}
function renderPlane(rgba,w,h,options){
 assert.equal(w,h,'Square native snapshot expected');assert.ok(options&&typeof options.encoding==='string');
 const input=topDown(rgba,w,h),out=Buffer.alloc(w*h*4),channel=options.channel??0;
 assert.ok(Number.isInteger(channel)&&channel>=0&&channel<4);
 if(options.encoding==='channel'){
  for(let i=0;i<w*h;i++){const v=input[i*4+channel];out[i*4]=out[i*4+1]=out[i*4+2]=v;out[i*4+3]=255}
 }else{
  assert.ok(['native-c','background-encoded-c','common-c'].includes(options.encoding));
  const scale=options.scale;assert.ok(scale>0&&scale<=1);const ratio=options.ratio??{numerator:1,denominator:1};
  assert.ok(ratio.denominator>0&&ratio.numerator>0);
  for(let i=0;i<w*h;i++){
   const paper=options.paper?options.paper[Math.min(options.paper.length-1,Math.floor(Math.floor(i/w)/h*1024)*1024+Math.floor((i%w)/w*1024))]:128;
   const bg=250+(paper-128)*.025;
   for(let c=0;c<3;c++){
    let code=input[i*4+c];
    if(options.encoding==='background-encoded-c')code=255*code/Math.max(1,255-code);
    if(options.encoding!=='common-c')code=Math.min(255,Math.floor((code*ratio.numerator+Math.floor(ratio.denominator/2))/ratio.denominator));
    out[i*4+c]=Math.round(Math.min(255,bg*Math.exp(-4*code/(255*scale))));
   }
   out[i*4+3]=255;
  }
 }
 return{png:png(out,w),pixels:out,width:w,height:h};
}
module.exports={topDown,renderPlane};

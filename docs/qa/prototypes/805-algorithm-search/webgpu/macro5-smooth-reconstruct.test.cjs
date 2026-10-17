'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {reconstruct,pair}=require('./macro5-smooth-reconstruct.cjs');
test('all impulses incl edges/corners preserve four masses and premultiplication',()=>{
for(const [w,h]of [[1,1],[1,3],[2,2],[3,5]])for(const r of [1,2,3,8])for(let j=0;j<w*h;j++){
 const a=new Float64Array(w*h*4);a.set([.1,.2,.3,.6],j*4);const o=reconstruct(a,w,h,r);
 for(let c=0;c<4;c++){let s=0;for(let i=c;i<o.length;i+=4)s+=o[i];assert.ok(Math.abs(s-a[j*4+c]*r*r)<1e-10);}
 for(let i=0;i<o.length;i+=4)for(let c=0;c<3;c++)assert.ok(o[i+c]>=0&&o[i+c]<=o[i+3]+1e-15);
}});
test('all-dry literal identity; overflow is exposed, never silently clipped',()=>{
 const d=Float64Array.from({length:256},(_,i)=>(i%7)/8);
 assert.deepEqual(reconstruct(new Float64Array(4),1,1,8,d),d);
 assert.ok(reconstruct(Float64Array.of(.5,.5,.5,.5),1,1,8,d).some(v=>v>1));
});
test('symmetric pair exchange preserves mass and premultiplied cone',()=>{
 for(let j=0;j<=50;j++){const a=[.1,.2,.3,.5],b=[.6,.4,.2,.8],[u,v]=pair(a,b,j/100);
 for(let c=0;c<4;c++)assert.ok(Math.abs(u[c]+v[c]-a[c]-b[c])<1e-14);
 for(const p of [u,v])for(let c=0;c<3;c++)assert.ok(p[c]>=0&&p[c]<=p[3]);}
});
test('bilinear alone fails static wall isolation: do not certify it',()=>{
 const a=new Float64Array(12);a.set([1,0,0,1]);assert.ok(reconstruct(a,3,1,8)[8*4]>0);
});

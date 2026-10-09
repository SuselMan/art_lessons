import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installFrontOperandCapture} from './front-operands.mjs'
const sha='a'.repeat(64)
function fixture(){let active=false,calls=0;class Adapter{owner={device:{},paper:{field:{texture:{},width:2048,height:2048},texSize:[1754,2480],scale:1},noise:{texture:{},width:251,height:251}};waterFrontStep(){calls++;return 'original'}}
const a=new Adapter(),field={w:731,h:667},buffer={width:731,height:667};const invoke=(climb=30,x=10)=>a.waterFrontStep(field,x,20,80,buffer,buffer,164,climb,.35,1,1)
return {Adapter,a,invoke,setActive:v=>active=v,count:()=>calls,options:{enabled:true,dev:true,active:()=>active,paperSHA:sha,noiseSHA:sha,sourceSHA:sha}}}
test('OFF has no resource access or wrapping',()=>{const f=fixture(),original=f.Adapter.prototype.waterFrontStep;const c=installFrontOperandCapture(f.Adapter,{enabled:false});assert.equal(c.read(),null);assert.equal(f.Adapter.prototype.waterFrontStep,original)})
test('captures actual first selected geometry; immutable copy and original return',()=>{const f=fixture(),original=f.Adapter.prototype.waterFrontStep,c=installFrontOperandCapture(f.Adapter,f.options);try{assert.equal(f.invoke(),'original');assert.equal(c.read(),null);f.setActive(true);f.invoke(0);assert.equal(c.read(),null);f.invoke();f.invoke();const r=c.read();assert.equal(r.calls,2);assert.deepEqual(r.operands.paperOrigin,[10,-687]);assert.equal(r.operands.width,731);assert.equal(r.operands.paperScale,1);r.operands.width=0;assert.equal(c.read().operands.width,731);assert.equal(f.count(),4)}finally{c.restore()}assert.equal(f.Adapter.prototype.waterFrontStep,original)})
test('mutable domain fails closed before encode; restore after exception',()=>{const f=fixture(),original=f.Adapter.prototype.waterFrontStep,c=installFrontOperandCapture(f.Adapter,f.options);try{f.setActive(true);f.invoke();assert.throws(()=>f.invoke(30,11),/changed/);assert.equal(f.count(),1)}finally{c.restore()}assert.equal(f.Adapter.prototype.waterFrontStep,original)})
test('reject missing provenance and non-DEV before installation',()=>{const f=fixture(),original=f.Adapter.prototype.waterFrontStep;assert.throws(()=>installFrontOperandCapture(f.Adapter,{...f.options,dev:false}),/DEV/);assert.throws(()=>installFrontOperandCapture(f.Adapter,{...f.options,paperSHA:''}),/SHA/);assert.equal(f.Adapter.prototype.waterFrontStep,original)})
test('cache neighbor address matches original f32 pixel expression at boundary cells',()=>{
 const f=Math.fround
 for(const [w,h] of [[1,1],[731,667],[1024,1024],[1536,999]])for(const qx of new Set([0,Math.floor(w/2),w-1]))for(const qy of new Set([0,Math.floor(h/2),h-1]))for(const stride of [1,2,8])for(const [ox,oy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]]){
  const nx=qx+ox*stride,ny=qy-oy*stride;if(nx<0||ny<0||nx>=w||ny>=h)continue
  const old=[f(f(qx+.5)+f(ox*stride)),f(f(f(h-qy)-.5)+f(oy*stride))],cached=[f(nx+.5),f(f(h-ny)-.5)]
  assert.deepEqual(cached,old)
 }
})

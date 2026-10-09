import {test} from 'node:test';import assert from 'node:assert/strict';
import {packContact,scanExposure,contactExposure,exposeOrMutatePayload} from './PackedContactPeak.mjs';
test('stored byte peak exact over finite/wrap/NaN/Infinity/±zero and arbitrary direction values',()=>{
 const values=[0,-0,NaN,Infinity,-Infinity,-2,-1,.0001,.5,1,1.01,2,255,256,...Array.from({length:256},(_,i)=>i/255)];
 for(const w of values){const weights=Float32Array.from([w,0,-0]),vx=Float32Array.from([1,NaN,-Infinity]),vy=Float32Array.from([-1,Infinity,NaN]);const p=packContact(vx,vy,weights,{privateOwnedImmutable:true});assert.ok(Object.is(contactExposure(p,{exclusiveUnexposedPayload:true}),scanExposure(p)));}
});
test('uncertified, copies, mutable workspace and exposure invalidate certificate',()=>{
 const p=packContact([1],[1],[.5],{privateOwnedImmutable:true});p[2]=255;assert.equal(contactExposure(p),scanExposure(p));
 exposeOrMutatePayload(p);assert.equal(contactExposure(p,{exclusiveUnexposedPayload:true}),scanExposure(p));
 const copied=p.slice();copied[2]=0;assert.ok(Object.is(contactExposure(copied,{exclusiveUnexposedPayload:true}),0));
 const untrusted=packContact([1],[1],[.2]);untrusted[2]=0;assert.equal(contactExposure(untrusted,{exclusiveUnexposedPayload:true}),0);
});
test('ordered upload payload remains identical to original pack formula',()=>{
 const n=512,w=Float32Array.from({length:n},(_,i)=>(i%99)/98),x=Float32Array.from(w,v=>v*.3),y=Float32Array.from(w,v=>v*-.8),p=packContact(x,y,w,{privateOwnedImmutable:true}),expected=new Uint8Array(n*4);
 for(let i=0;i<n;i++){expected[i*4]=Math.round(127.5+127.5*(w[i]>0?x[i]/w[i]:0));expected[i*4+1]=Math.round(127.5+127.5*(w[i]>0?y[i]/w[i]:0));expected[i*4+2]=Math.round(255*w[i]);expected[i*4+3]=255;}assert.deepEqual(p,expected);assert.equal(contactExposure(p,{exclusiveUnexposedPayload:true}),scanExposure(expected));
});
test('workspace float reuse does not mutate fresh packed payload',()=>{const w=new Float32Array([.5]),x=new Float32Array([.2]),y=new Float32Array([.1]),p=packContact(x,y,w,{privateOwnedImmutable:true}),before=p.slice(),peak=contactExposure(p,{exclusiveUnexposedPayload:true});w.fill(1);x.fill(-1);y.fill(NaN);assert.deepEqual(p,before);assert.equal(contactExposure(p,{exclusiveUnexposedPayload:true}),peak)})

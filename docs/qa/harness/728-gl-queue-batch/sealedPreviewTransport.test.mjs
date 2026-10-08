import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SealedPreviewTransport, PREVIEW_BYTES } from './SealedPreviewTransport.mjs'
function fixture() {
 const source = Object.fromEntries(['original','coverage','pigmentLoad','pigmentBase','colourLoad','colourBase','solventLoad','solventBase'].map(k=>[k,{texture:{k}}]))
 let releases=0
 const lease=Object.fromEntries(['p0','c0','p1','c1','water','coverage','pending'].map(k=>[k,{texture:{k},width:k==='pending'?1024:128,height:k==='pending'?1024:128}]))
 lease.bytes=PREVIEW_BYTES;lease.release=()=>releases++
 return {source,lease,get releases(){return releases}}
}
test('sealed paired old-input ping-pong; active pen takes priority; original roles untouched',()=>{
 const f=fixture(), before=structuredClone(f.source), p=new SealedPreviewTransport({...f,token:1})
 assert.equal(p.begin(),null); const init=p.seal();assert.equal(init.source.original,f.source.original)
 assert.equal(p.begin({penActive:true}),null)
 const a=p.begin(); assert.equal(a.p,f.lease.p0);assert.equal(a.c,f.lease.c0);assert.equal(a.outP,f.lease.p1);assert.equal(a.outC,f.lease.c1)
 assert.equal(p.begin(),null);assert.throws(()=>p.reset());assert.equal(p.complete(a),true)
 const b=p.begin();assert.equal(b.p,f.lease.p1);assert.equal(b.c,f.lease.c1);p.complete(b)
 assert.deepEqual(f.source,before);assert.equal(p.reset().epoch,2);assert.equal(p.complete(a),false)
})
test('cancel retains physical lease until matching fence, stale completion cannot publish',()=>{
 const f=fixture(), p=new SealedPreviewTransport({...f,token:7});p.seal();const work=p.begin(), fence=p.retire()
 assert.equal(p.retire(),fence);assert.equal(f.releases,0);assert.equal(p.begin(),null);assert.equal(p.complete(work),false)
 assert.throws(()=>p.releaseAfterFence({token:7,epoch:0}));assert.equal(f.releases,0)
 p.releaseAfterFence(fence);p.releaseAfterFence(fence);assert.equal(p.retire(),fence);assert.equal(f.releases,1);assert.equal(p.begin(),null);assert.equal(p.complete(work),false)
})
test('reject aliases/dimensions/missing physical ledger before any write',()=>{
 let f=fixture();f.lease.p1=f.lease.p0;assert.throws(()=>new SealedPreviewTransport({...f,token:1}))
 f=fixture();f.lease.pending.texture=f.source.original.texture;assert.throws(()=>new SealedPreviewTransport({...f,token:1}))
 f=fixture();f.lease.water.width=127;assert.throws(()=>new SealedPreviewTransport({...f,token:1}))
 f=fixture();f.lease.bytes--;assert.throws(()=>new SealedPreviewTransport({...f,token:1}))
 assert.equal(PREVIEW_BYTES*3,13762560)
})

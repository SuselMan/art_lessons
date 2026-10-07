import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FutureSourceTransaction } from './transaction.mjs'
function rig(layer = 'A') {
 const oldJob = { scratch: { layer: 'A' } }, future = { layer, original: 3, P: 0, C: 0, V: 0, coverage: 0 }
 let alive = true; const releases = [], order = []
 const tx = new FutureSourceTransaction({ enabled:true, oldJob, futureScratch:future, epoch:7,
 resources:[{retained:true,alive:()=>alive}],release:lost=>releases.push(lost) })
 const finish = () => tx.complete({ oldJob,epoch:7,compositeDone:true,
 rebaseOriginal:s=>{order.push('old-composite/base'); if(layer==='A') s.original=11},
 restoreImportedBase:s=>{order.push('import');s.P=0;s.C=0;s.V=5;s.coverage=2},
 compositeFuture:s=>{order.push('composite');s.pixel=s.original+s.P+s.C} })
 return {tx,oldJob,future,releases,order,finish,die:()=>{alive=false}}
}
test('retained import + distinct dry-land base precede immutable source once; separate layer retains its base',()=>{
 for(const layer of ['A','B']) {const r=rig(layer)
 // An immutable source record holds scalar copies, not mutable UI state.
 const live={P:7,C:13};const saved={...live}
 r.tx.append({immutable:true,run:s=>{r.order.push('source');s.P+=saved.P;s.C+=saved.C;s.V+=1;s.coverage+=3}})
 live.P=900;live.C=800
 // Immediate deposit is later overwritten by old land. Rebase must not add it twice.
 r.future.P=7;r.future.C=13
 assert.equal(r.tx.blocksPublication,true);assert.equal(r.finish(),true)
 const sequential={original:layer==='A'?11:3,P:7,C:13,V:6,coverage:5,pixel:(layer==='A'?11:3)+20,layer}
 assert.deepEqual(r.future,sequential);assert.deepEqual(r.order,['old-composite/base','import','source','composite'])
 assert.equal(r.finish(),false);assert.deepEqual(r.releases,[false]);assert.equal(r.tx.blocksPublication,false)
 }
})
test('wrong owner/epoch and missing old composite cannot rebase',()=>{const r=rig();assert.equal(r.tx.complete({oldJob:{},epoch:7}),false);assert.equal(r.tx.complete({oldJob:r.oldJob,epoch:8}),false);assert.throws(()=>r.tx.complete({oldJob:r.oldJob,epoch:7,compositeDone:false}));assert.deepEqual(r.releases,[])})
test('destroyed donor cannot replay; loss forgets exactly once and stale completion cannot write',()=>{const r=rig();let writes=0;r.tx.append({immutable:true,run:()=>writes++});r.die();assert.throws(r.finish,/resources/);assert.equal(writes,0);assert.equal(r.tx.cancel({lost:true}),true);assert.equal(r.tx.cancel(),false);assert.equal(r.finish(),false);assert.deepEqual(r.releases,[true])})
test('ordinary cancellation drops only future commands and releases retained owner',()=>{const r=rig();r.tx.append({immutable:true,run:()=>assert.fail()});assert.equal(r.tx.cancel(),true);assert.equal(r.finish(),false);assert.deepEqual(r.releases,[false])})
test('partial failure remains publication-blocked until scoped recovery',()=>{const r=rig();r.tx.append({immutable:true,run:()=>{throw Error('source failure')}});assert.throws(r.finish,/source failure/);assert.equal(r.tx.blocksPublication,true);assert.deepEqual(r.releases,[]);r.tx.cancel();assert.equal(r.tx.blocksPublication,false)})
test('default OFF never acquires resources or admits capture; unretained sampler rejected',()=>{const tx=new FutureSourceTransaction({release:()=>assert.fail()});assert.equal(tx.state,'disabled');assert.equal(tx.blocksPublication,false);assert.throws(()=>tx.append({immutable:true,run(){}}));assert.throws(()=>new FutureSourceTransaction({enabled:true,oldJob:{scratch:{}},futureScratch:{},epoch:1,release(){},resources:[{retained:false,alive:()=>true}]}),/Unowned/)})

test('command admission bounded, overflow does not discard already admitted source',()=>{const r=rig();r.tx.maxCommands=1;r.tx.append({immutable:true,run:s=>s.P+=1});assert.throws(()=>r.tx.append({immutable:true,run:s=>s.P+=99}),/budget/);assert.equal(r.finish(),true);assert.equal(r.future.P,1)})

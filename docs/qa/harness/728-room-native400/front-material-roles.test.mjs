import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readNativeFrontMaterialRoles,assertFrontMaterialRolePair} from './front-material-roles.mjs'
function fixture(){let calls=0;const field={field:{width:1,height:1,format:'rgba8unorm'}},adapter={staticFrontCacheCounters:null},material={inkLoad:field,inkColor:field},owner={fields:{current:{pressure:field,mask:field,coverage:field}},scratch:{peek:()=>material},target:{buffer:{}},adapter};const backend={diagnosticScopeState:{pending:0,live:true},diagnosticRetirementCleanupFailures:0,readField:async()=>{calls++;return new Uint8Array([1,2,3,4])}},runtime={owner,backend,central:{isIdle:true}},engine={_wcNative:runtime,_wcCanonical:{pending:false},gl:{isContextLost:()=>false,getError:()=>0}};return{engine,runtime,backend,count:()=>calls}}
test('only idle endpoint reads sequential roles and retains metadata',async()=>{const f=fixture(),row=await readNativeFrontMaterialRoles(f.engine,0);assert.equal(f.count(),5);assert.equal(row.roles.pressure.bytes,4);assert.ok(row.roles.color.nonzero);assert.match(row.roles.color.sha256,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(row).includes('Uint8Array'),false)})
test('pending/lost/scope guards reject before read',async()=>{for(const state of ['pending','lost','scope']){const f=fixture();if(state==='pending')f.engine._wcCanonical.pending=true;if(state==='lost')f.engine.gl.isContextLost=()=>true;if(state==='scope')f.backend.diagnosticScopeState.pending=1;await assert.rejects(()=>readNativeFrontMaterialRoles(f.engine,0));assert.equal(f.count(),0)}})
test('same native Q8 role pair requires cache consumption, retirement and meaningful final pigment',async()=>{const f=fixture(),a=await readNativeFrontMaterialRoles(f.engine,0),b=await readNativeFrontMaterialRoles(f.engine,1,true),off=[a,b],on=structuredClone(off);for(const row of on)row.cache={prep:1,hits:215,retainedBytes:0,cleanupFailures:0};assert.equal(assertFrontMaterialRolePair(off,on).exact,true);for(const mutate of [rows=>rows[0].roles.mask.sha256='f'.repeat(64),rows=>rows[0].cache.hits=0,rows=>rows[1].roles.color.nonzero=0,rows=>rows[0].cache.retainedBytes=8,rows=>rows[0].operationIndex=1,rows=>rows[1].retirementCleanupFailures=1]){const bad=structuredClone(on);mutate(bad);assert.throws(()=>assertFrontMaterialRolePair(off,bad))}})

test('logical idle waits existing queue completion before reads without weakening scope guard',async()=>{
 const f=fixture();f.backend.diagnosticScopeState.pending=1;let waited=0
 f.backend.whenIdle=async()=>{assert.equal(f.count(),0);waited++;f.backend.diagnosticScopeState.pending=0}
 await readNativeFrontMaterialRoles(f.engine,0);assert.equal(waited,1);assert.equal(f.count(),5)
 for(const mode of ['unreleased','reject','changed']){const g=fixture();g.backend.diagnosticScopeState.pending=1;g.backend.whenIdle=async()=>{if(mode==='reject')throw Error('queue failed');if(mode==='changed'){g.backend.diagnosticScopeState.pending=0;g.runtime.owner={}}};await assert.rejects(()=>readNativeFrontMaterialRoles(g.engine,0));assert.equal(g.count(),0)}
})
test('scalar checkpoint chronology follows existing ACK then each actual read, failure stops subsequent reads',async()=>{
 const prior=globalThis.window;try{
  for(const fail of [false,true]){const f=fixture(),rows=[];globalThis.window={__nativeReplayCheckpoint:(phase,index,role=null)=>rows.push({phase,index,role})};const original=f.backend.readField;f.backend.readField=async x=>{if(fail)throw Error('read failed');return original(x)}
   if(fail)await assert.rejects(()=>readNativeFrontMaterialRoles(f.engine,0),/read failed/);else await readNativeFrontMaterialRoles(f.engine,0)
   assert.equal(rows[0].phase,'existingAckDone');assert.equal(rows[1].phase,'roleReadStart');assert.equal(rows[1].role,'pressure')
   if(fail)assert.equal(rows.length,2);else{assert.equal(rows.length,11);assert.equal(rows.at(-1).phase,'roleReadDone');assert.equal(rows.at(-1).role,'color')}
  }
 }finally{if(prior===undefined)delete globalThis.window;else globalThis.window=prior}
})

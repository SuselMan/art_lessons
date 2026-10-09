import test from'node:test';import assert from'node:assert/strict'
import{assertSourcePrepared,assertSourceConsumed}from'./source-precompile-proof.mjs'
const source='a'.repeat(40),expected=Array.from({length:15},(_,i)=>({key:String(i),kind:i<12?'render':'compute',shaderSHA:'b'.repeat(64),descriptorSHA:'c'.repeat(64)})),proofs=expected.map(x=>({...x,completed:true,compilerWallMs:2})),diagnostics=expected.map(x=>({...x,completed:true,hits:0})),p={proofs,dispatches:0,fieldBytes:0,resourceBefore:[{id:1,bytes:4}],resourceAfter:[{id:1,bytes:4}]},input={source,expectedSource:source,enabled:true,expected,diagnostics,readyAt:10,markers:[{stage:'source-precompile:completed',at:9,proof:p}]}
test('exact beforeREADY proof and selected constructor subset allow unused compiled recipes',()=>{assertSourcePrepared(input);assertSourceConsumed(diagnostics.map((x,i)=>({...x,hits:i<3?1:0})),['0','1','2'],expected.map(x=>x.key));assert.throws(()=>assertSourceConsumed(diagnostics,['0'],expected.map(x=>x.key)))})
test('source, descriptor, timing and persistent field changes fail closed',()=>{for(const bad of [{...input,enabled:false},{...input,expectedSource:'d'.repeat(40)},{...input,readyAt:8},{...input,markers:[{stage:'source-precompile:completed',at:9,proof:{...p,resourceAfter:[]}}]},{...input,expected:expected.map((x,i)=>i?x:{...x,descriptorSHA:'f'.repeat(64)})}])assert.throws(()=>assertSourcePrepared(bad))})
test('foreign prepared keys, unknown required keys and duplicate diagnostic entries fail closed',()=>{
 const keys=expected.map(x=>x.key),hit=diagnostics.map(x=>({...x,hits:1}))
 assert.throws(()=>assertSourcePrepared({...input,diagnostics:diagnostics.map(x=>({...x,key:'foreign'+x.key}))}))
 assert.throws(()=>assertSourceConsumed(hit,['foreign'],keys))
 assert.throws(()=>assertSourceConsumed([...hit.slice(0,14),hit[0]],['0'],keys))
 assert.throws(()=>assertSourceConsumed(hit,['0','0'],keys))
})

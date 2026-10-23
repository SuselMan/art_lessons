'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const eb=require('/home/suselman/projects/pencil-agents/805-watercolor-search/node_modules/esbuild');
const KEY='__qaNativeAnatomy805',stages=['align.rawP','contrast.background','stitch.complete','front.rimPrepared','diffusion.complete','land.complete','background.reconstruct','background.reconstruct','dry.coverage'];
function rig({sequence=stages,missingExtension=false,ns=1000000,disjoint=false,external=false,neverReady=false}={}){
 const m={exports:{}},sandbox={module:m,exports:m.exports,performance:{now:()=>clock},setTimeout,Object,Promise,Error,Number};let clock=0,active=null,ready=false,deleted=0,created=0,polls=0,readDuringQuery=0,forcedDisjoint=disjoint;
 const ext={TIME_ELAPSED_EXT:1,CURRENT_QUERY_EXT:2,QUERY_COUNTER_BITS_EXT:3,QUERY_RESULT_EXT:4,QUERY_RESULT_AVAILABLE_EXT:5,GPU_DISJOINT_EXT:6,
 createQueryEXT(){created++;return{id:created}},deleteQueryEXT(){deleted++},beginQueryEXT(_,q){assert.equal(active,null);active=q},endQueryEXT(){assert.ok(active);active=null},
 getQueryEXT(_,p){return p===2?(external?{}:active):64},getQueryObjectEXT(q,p){polls++;return p===5?ready:(typeof ns==='function'?ns(q.id):ns)}};
 const gl={NO_ERROR:0,getExtension:()=>missingExtension?null:ext,getParameter:()=>forcedDisjoint,isContextLost:()=>false,getError:()=>0,flush(){assert.equal(active,null)}};
 vm.runInNewContext(eb.transformSync(fs.readFileSync(__dirname+'/gpu-group-goal.ts','utf8'),{loader:'ts',format:'cjs',target:'es2022'}).code,sandbox);
 const original=function(){for(const stage of sequence)sandbox[KEY]?.({stage,outputs:{p:{readPixels(){readDuringQuery++;throw Error('Must not read')}}}});return'buffers'},controller={diagnosticRunCore:original};
 const hash='a'.repeat(64),sourceSHA=Object.fromEntries(['p','c','coverage','solvent','foreign','original','paper'].map(k=>[k,hash]));
 const proof={outputSHA:{p:hash,c:hash,coverage:hash},sourceSHA,sourceSHAAfter:{...sourceSHA},sourceUnchanged:true,metadataSHA:hash};
 const runDirect=async()=>{assert.equal(active,null);controller.diagnosticRunCore();assert.equal(active,null);return proof};
 const options={gl,controller,runDirect,mode:'groups',baseline:structuredClone(proof),now:()=>clock,pause:async(ms)=>{assert.equal(active,null);clock+=Math.max(1,ms);if(!neverReady)ready=true},timeoutMs:10,pollMs:2};
 return{run:(overrides={})=>m.exports.runNativeGpuTimedGoal805({...options,...overrides}),proof,sandbox,controller,original,setDisjoint:v=>forcedDisjoint=v,stats:()=>({created,deleted,polls,readDuringQuery,active})};
}
test('eight nonoverlapping real semantic intervals; no picture reads; whole is separate; all resources restored',async()=>{
 const r=rig(),answer=await r.run();assert.equal(answer.gpu.intervals.length,8);assert.equal(answer.gpu.totalGpuMs,8);assert.equal(answer.gpu.intervals[0].id,'ungrouped');assert.equal(answer.gpu.intervals[7].id,'protect');assert.equal(answer.gpu.baselineCompared,true);assert.equal(r.stats().readDuringQuery,0);assert.equal(r.stats().deleted,8);assert.equal(r.controller.diagnosticRunCore,r.original);assert.equal(Object.hasOwn(r.sandbox,KEY),false);
 const whole=rig(),w=await whole.run({mode:'whole'});assert.equal(w.gpu.intervals.length,1);assert.equal(w.gpu.intervals[0].id,'whole');assert.equal(w.gpu.totalGpuMs,1);assert.equal(whole.stats().created,1);assert.equal(whole.stats().deleted,1);
});
test('async query availability yields outside query; pending results eventually timeout and clean',async()=>{
 const r=rig({neverReady:true});await assert.rejects(r.run(),/timeout/);assert.equal(r.stats().deleted,8);assert.equal(r.stats().active,null);assert.equal(Object.hasOwn(r.sandbox,KEY),false);
});
test('missing/duplicate/out-of-order semantic boundaries fail closed and clean active query',async()=>{
 for(const sequence of [stages.slice(0,-1),stages.filter(s=>s!=='stitch.complete'),['align.rawP','align.rawP'],['contrast.background']]){const r=rig({sequence});await assert.rejects(r.run(),/boundary/);assert.equal(r.stats().deleted,8);assert.equal(r.stats().active,null);assert.equal(r.controller.diagnosticRunCore,r.original)}
 const wholeWithoutTaps=rig({sequence:[]});await assert.rejects(wholeWithoutTaps.run({mode:'whole'}),/missing semantic boundary/);assert.equal(wholeWithoutTaps.stats().deleted,1);assert.equal(wholeWithoutTaps.stats().active,null);
});
test('missing extension, external nesting, initial and later disjoint reject measurement',async()=>{
 for(const config of [{missingExtension:true},{external:true},{disjoint:true}]){const r=rig(config);await assert.rejects(r.run(),/unavailable|nested|disjoint/);assert.equal(r.stats().created,0)}
 const r=rig();await assert.rejects(r.run({pause:async()=>r.setDisjoint(true)}),/disjoint/);assert.equal(r.stats().deleted,8);
});
test('zero, missing, unsafe results cannot masquerade as free effects',async()=>{
 for(const ns of [0,undefined,NaN,-1,2**54]){const r=rig({ns:()=>ns});await assert.rejects(r.run(),/missing\/zero\/invalid/);assert.equal(r.stats().deleted,8)}
});
test('strict output/input/metadata baseline and unchanged source seven proofs',async()=>{
 for(const key of ['p','c','coverage']){const r=rig();r.proof.outputSHA[key]='b'.repeat(64);await assert.rejects(r.run(),/baseline output differs/)}
 const source=rig();source.proof.sourceSHAAfter.paper='b'.repeat(64);await assert.rejects(source.run(),/source paper/);
 const metadata=rig();metadata.proof.metadataSHA='b'.repeat(64);await assert.rejects(metadata.run(),/metadata differs/);
 const missing=rig();delete missing.proof.sourceSHA.foreign;await assert.rejects(missing.run(),/missing source foreign/);
});
test('no core call, nested core call and core exception restore controller/hook/query ownership',async()=>{
 const missing=rig();await assert.rejects(missing.run({runDirect:async()=>missing.proof}),/missing\/incomplete core/);assert.equal(missing.stats().deleted,8);
 const twice=rig();await assert.rejects(twice.run({runDirect:async()=>{twice.controller.diagnosticRunCore();twice.controller.diagnosticRunCore();return twice.proof}}),/nesting\/repeat/);assert.equal(twice.stats().active,null);assert.equal(twice.stats().deleted,8);
 const throws=rig();await assert.rejects(throws.run({runDirect:async()=>{throws.controller.diagnosticRunCore();throw Error('core failure')}}),/core failure/);assert.equal(throws.stats().deleted,8);assert.equal(throws.controller.diagnosticRunCore,throws.original);
});

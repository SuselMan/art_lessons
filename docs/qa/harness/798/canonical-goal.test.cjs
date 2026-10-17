// Run: node --test docs/qa/harness/798/canonical-goal.test.cjs
// Evaluates the actual page readiness function with plain state; no engine/browser/GPU.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const ts=require('typescript');
const page=fs.readFileSync(require('node:path').resolve(__dirname,'../../../../apps/web/qa-independent-tiles-v2.ts'),'utf8');
const fn=page.match(/^function readiness\(\).*$/m)[0];
const compiled=ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){const layer={epoch:1,goalReady:true,dirty:false,target:{}};const d={gl:{isContextLost:()=>false},_wcCanonical:{pending:true},_strokeId:null,_opQueue:[],_pendingRebuilds:new Set(),_unsettledLayers:new Set(),_rebuildJobs:new Map(),_puddle:{state:{pending:false},layers:new Map([['L',layer]]),hasMaterial:()=>true}};const b={diag:()=>d,engine:{},paperLoaded:true,drawing:false,clock:{failed:null},faultReason:()=>null};vm.createContext(b);vm.runInContext(compiled,b);return{d,goal:()=>vm.runInContext('readiness().goal',b)}}
test('ready layer with canonical FIFO pending is incomplete source',()=>{const f=fixture();assert.equal(f.goal(),false);f.d._wcCanonical.pending=false;assert.equal(f.goal(),true)});
test('first goal retains independent distinction from other engine-idle blockers',()=>{const f=fixture();f.d._wcCanonical.pending=false;f.d._rebuildJobs.set('other',{});f.d._unsettledLayers.add('other');assert.equal(f.goal(),true);f.d._puddle.state.pending=true;assert.equal(f.goal(),false)});

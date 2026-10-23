'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const eb=require('/home/suselman/projects/pencil-agents/805-watercolor-search/node_modules/esbuild'),{transformNativeCpuTimeline805,KEY}=require('./cpu-source.cjs'),{transformNativeAnatomy}=require('./source-taps.cjs');
const root=path.resolve(__dirname,'../../../..');
const files=['apps/web/src/engine/src/watercolor/puddle/ContrastPhase.ts','apps/web/src/engine/src/watercolor/puddle/PuddleTarget.ts','apps/web/src/engine/src/watercolor/puddle/BackgroundMix.ts','apps/web/src/engine/src/raster/WatercolorSettlePlan.ts','apps/web/src/engine/src/raster/WatercolorFrontPaths.ts','docs/qa/prototypes/native-mini-optimized805/native-direct-timed.ts','docs/qa/prototypes/native-anatomy-805/gpu-group-goal.ts'];
test('all seven actual source files parse, retain native read/draw counts, and compose after anatomy',()=>{
 for(const file of files){const raw=fs.readFileSync(path.join(root,file),'utf8'),s=file.startsWith('apps/')?transformNativeAnatomy(file,raw):raw,next=transformNativeCpuTimeline805(file,s);eb.transformSync(next,{loader:'ts',target:'es2022'});for(const call of ['readPixels','drawArrays','waterFrontStep','diffuseStep'])assert.equal((next.match(new RegExp('\\.'+call+'\\(','g'))||[]).length,(s.match(new RegExp('\\.'+call+'\\(','g'))||[]).length,file+' '+call);assert.throws(()=>transformNativeCpuTimeline805(file,next),/already applied/)}
 assert.throws(()=>transformNativeCpuTimeline805('ContrastPhase.ts',fs.readFileSync(path.join(root,files[0]),'utf8')),/preceding anatomy/);assert.equal(transformNativeCpuTimeline805('Else.ts','x'),'x');
});
function rig(){let clock=0;const m={exports:{}},sandbox={module:m,exports:m.exports,Object,Map,Number,Error,performance:{now:()=>clock}};vm.runInNewContext(eb.transformSync(fs.readFileSync(__dirname+'/cpu-timeline.ts','utf8'),{loader:'ts',format:'cjs'}).code,sandbox);return{...m.exports,sandbox,set:t=>clock=t,emit:e=>sandbox[KEY](e)}}
function core(r,{missing=false}={}){
 r.set(10);r.emit({type:'begin',id:'core',lane:'cpu'});
 for(const [at,stage]of [[11,'align.rawP'],[12,'contrast.background']]){r.set(at);r.emit({type:'stage',stage})}
 r.set(12.1);r.emit({type:'begin',id:'selection.readback',lane:'transfer'});r.set(13);r.emit({type:'end',id:'selection.readback'});r.emit({type:'begin',id:'selection.filter',lane:'cpu'});r.set(14);r.emit({type:'end',id:'selection.filter'});r.emit({type:'begin',id:'selection.upload',lane:'transfer'});r.set(14.5);r.emit({type:'end',id:'selection.upload'});
 for(const [at,stage]of [[15,'stitch.complete'],[20,'front.rimPrepared'],[25,'diffusion.complete'],[27,'land.complete'],[27.5,'background.reconstruct'],[28,'background.reconstruct'],[28.2,'dry.coverage']]){if(missing&&stage==='stitch.complete')continue;r.set(at);r.emit({type:'stage',stage})}
 r.set(28.5);r.emit({type:'end',id:'core'});
}
test('one run gives aligned host spans, exact nonoverlapping core groups and nested transfer children',async()=>{
 const r=rig(),x=await r.collectNativeCpuTimeline805(async()=>{
  r.set(1);r.emit({type:'begin',id:'source.before-proof',lane:'cpu'});r.emit({type:'begin',id:'source.capture-seven',lane:'cpu'});r.set(3);r.emit({type:'end',id:'source.capture-seven'});r.set(9);r.emit({type:'end',id:'source.before-proof'});core(r);r.set(28.6);r.emit({type:'begin',id:'output.c-read',lane:'transfer'});r.set(80.6);r.emit({type:'end',id:'output.c-read'});r.set(81);r.emit({type:'begin',id:'query.poll',lane:'cpu'});r.set(82);r.emit({type:'end',id:'query.poll'});r.set(83);return'actual-result'
 });
 assert.equal(x.result,'actual-result');assert.equal(x.cpuTimeline.wallMs,83);const tasks=x.cpuTimeline.tasks,groups=tasks.filter(t=>t.groupId&&t.operation.startsWith('group.'));assert.equal(groups.length,8);assert.equal(groups.reduce((n,t)=>n+t.elapsedMs,0),18.5);assert.equal(tasks.find(t=>t.operation==='selection.filter').parentId,'cpu-group-selection');assert.equal(tasks.find(t=>t.operation==='selection.readback').lane,'transfer');assert.equal(tasks.filter(t=>!t.parentId).reduce((n,t)=>n+t.elapsedMs,0),83);assert.ok(tasks.every(t=>t.clock==='host'&&t.wallAligned&&t.elapsedMs>=0));assert.equal(Object.hasOwn(r.sandbox,KEY),false);
});
test('missing semantic event, mismatched nesting, open span and work failure fail closed and restore observer',async()=>{
 for(const kind of ['missing','nesting','open','error']){const r=rig();Object.defineProperty(r.sandbox,KEY,{configurable:true,writable:false,value:undefined});const saved=Object.getOwnPropertyDescriptor(r.sandbox,KEY);await assert.rejects(r.collectNativeCpuTimeline805(async()=>{if(kind==='error')throw Error('work failure');if(kind==='nesting'){r.emit({type:'begin',id:'a'});r.emit({type:'end',id:'b'})}if(kind==='open'){r.emit({type:'begin',id:'open'});return}core(r,{missing:true})}),/missing semantic|nesting\/order|unclosed|work failure/);assert.deepEqual(Object.getOwnPropertyDescriptor(r.sandbox,KEY),saved)}
});
test('collector cannot replace another observer and does not allocate GPU resources',async()=>{const r=rig();r.sandbox[KEY]=()=>{};await assert.rejects(r.collectNativeCpuTimeline805(async()=>{}),/already installed/)});

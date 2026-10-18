'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const eb=require('/home/suselman/projects/pencil-agents/798-wave-buffer/node_modules/esbuild'),{KEY,transformNativeExpansion805}=require('./source.cjs'),{transformNativeAnatomy}=require('../native-anatomy-805/source-taps.cjs');
const root=path.resolve(__dirname,'../../../..');
function load(){const m={exports:{}},sandbox={require:id=>{assert.ok(id.includes('AccumulationBuffer'));return{AccumulationBuffer:class{constructor(gl,width,height){this.width=width;this.height=height;this.texture={mask:true}}beginReplaceDraw(){}endDraw(){}destroy(){}}}},module:m,exports:m.exports,Uint8Array,Float32Array,Object,Math,Number,Error};vm.runInNewContext(eb.transformSync(fs.readFileSync(__dirname+'/expansion.ts','utf8'),{loader:'ts',format:'cjs'}).code,sandbox);return{...m.exports,sandbox}}
test('actual source transforms compose with anatomy, preserve defaults and guard against source drift',()=>{
 for(const name of ['ContrastPhase','WatercolorSettlePlan']){const file='apps/web/src/engine/src/'+(name==='ContrastPhase'?'watercolor/puddle/':'raster/')+name+'.ts',s=fs.readFileSync(path.join(root,file),'utf8'),next=transformNativeExpansion805(file,s);assert.notEqual(next,s);eb.transformSync(transformNativeAnatomy(file,next),{loader:'ts'});assert.throws(()=>transformNativeExpansion805(file,next),/already applied/)}
 assert.equal(transformNativeExpansion805('Unrelated.ts','x'),'x');assert.throws(()=>transformNativeExpansion805('ContrastPhase.ts','missing'),/drift/);
});
test('seeded CPU noise is bounded, stable, smooth and independent of GPU/transcendentals',()=>{
 const {expansionNoise805,expansionRadius805}=load(),a=expansionNoise805(),b=expansionNoise805();assert.equal(a.length,128*128*4);assert.equal(crypto.createHash('sha256').update(a).digest('hex'),crypto.createHash('sha256').update(b).digest('hex'));
 let worst=0;for(let y=0;y<128;y++)for(let x=0;x<128;x++){const i=(y*128+x)*4;assert.equal(a[i],a[i+1]);assert.equal(a[i],a[i+2]);assert.equal(a[i+3],255);if(x)worst=Math.max(worst,Math.abs(a[i]-a[i-4]));if(y)worst=Math.max(worst,Math.abs(a[i]-a[i-128*4]));}assert.ok(worst<35);assert.notDeepEqual(a,expansionNoise805(128,806));for(const radius of [0,97,2.5,NaN])assert.throws(()=>expansionRadius805(radius));assert.equal(expansionRadius805(),24);
});
function rig(){
 const module=load(),calls=[],deleted=[],waterA={id:'immutable-A'},waterB={id:'immutable-B'};let id=0,coreFlag=null;
 const gl=new Proxy({VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,CURRENT_PROGRAM:5,TEXTURE0:10,
 createShader:()=>({shader:++id}),getShaderParameter:()=>true,getProgramParameter:()=>true,createProgram:()=>({program:++id}),createBuffer:()=>({buffer:++id}),createTexture:()=>({texture:++id}),getUniformLocation:(_,name)=>name,getAttribLocation:()=>0,getParameter:()=>null,
 deleteProgram:v=>deleted.push(v),deleteTexture:v=>deleted.push(v),deleteBuffer:v=>deleted.push(v),drawArrays:()=>calls.push('draw'),texImage2D:(...args)=>calls.push({upload:args}),bindTexture:(_,v)=>calls.push({bound:v})
 },{get(o,k){return k in o?o[k]:()=>{}}});
 const src={width:8,height:8,texture:{id:'cost-source'}},dst={width:8,height:8,beginReplaceDraw(){calls.push('begin')},endDraw(){calls.push('end')}},field={w:8,h:8},originalFront=()=>calls.push('original-front'),passes={waterFrontStep:originalFront};
 const originalCore=function(){coreFlag=module.sandbox[KEY];passes.waterFrontStep(field,0,0,24,src,dst,28,30,.5,1,1);return'unchanged-native-buffers'},entry={inkLoad:{width:8,height:8},solventLoad:{texture:waterA},foreignSolventLoad:{texture:waterB}},controller={diagnosticSource:()=>({entry}),diagnosticRunCore:originalCore},engine={gl,_watercolorPasses:passes};
 return{...module,calls,deleted,engine,controller,field,src,dst,passes,originalFront,originalCore,waterA,waterB,coreFlag:()=>coreFlag};
}
test('installer scopes policy to core, borrows immutable water and cleans owned resources',()=>{
 const r=rig(),candidate=r.installNativeExpansion805(r.engine,r.controller,{noise:true,allWetMobile:true});assert.equal(r.sandbox[KEY],undefined);r.passes.waterFrontStep();assert.ok(r.calls.includes('original-front'));assert.equal(r.controller.diagnosticRunCore(),'unchanged-native-buffers');assert.equal(r.coreFlag().radiusPx,24);assert.equal(r.sandbox[KEY],undefined);assert.equal(candidate.stats.outwardDraws,1);assert.equal(r.calls.filter(x=>x==='draw').length,1);assert.equal(r.calls.filter(x=>x.upload).length,2);assert.ok(r.calls.some(x=>x.bound===r.waterA));assert.ok(r.calls.some(x=>x.bound===r.waterB));candidate.restore();candidate.restore();assert.equal(r.controller.diagnosticRunCore,r.originalCore);assert.equal(r.passes.waterFrontStep,r.originalFront);assert.equal(r.deleted.length,5);
});
test('main candidates preserve native selection by default and with explicit false; outward schedule does not depend on all-wet',()=>{
 for(const options of [{noise:false},{noise:true,allWetMobile:false}]){const r=rig(),candidate=r.installNativeExpansion805(r.engine,r.controller,options);r.controller.diagnosticRunCore();assert.equal(r.coreFlag().allWetMobile,false);assert.equal(candidate.metadata.allWetMobile,false);assert.match(candidate.metadata.selection,/Original native contrast/);candidate.restore()}
 const file=path.join(root,'apps/web/src/engine/src/raster/WatercolorSettlePlan.ts'),s=transformNativeExpansion805(file,fs.readFileSync(file,'utf8'));
 assert.match(s,/qaExpansion\?\.radiusPx!==undefined&&climb===WC_FRONT_CLIMB/);assert.doesNotMatch(s,/qaExpansion\?\.allWetMobile===true&&climb/);
});
test('bad field/stride fails before a draw and always unwinds transient global policy',()=>{
 const r=rig();r.controller.diagnosticRunCore=function(){r.passes.waterFrontStep(r.field,0,0,24,r.src,r.dst,28,30,.5,8,1)};const before=r.controller.diagnosticRunCore,candidate=r.installNativeExpansion805(r.engine,r.controller,{noise:false,allWetMobile:true});assert.throws(()=>r.controller.diagnosticRunCore(),/unit-step/);assert.equal(r.sandbox[KEY],undefined);assert.equal(r.calls.filter(x=>x==='draw').length,0);candidate.restore();assert.equal(r.controller.diagnosticRunCore,before);
});
test('interactive null-controller source scope never installs diagnostic hooks and never leaks water to next stroke',()=>{
 const r=rig(),before=r.controller.diagnosticRunCore,candidate=r.installNativeExpansion805(r.engine,null,{noise:true,allWetMobile:false}),sourceA={entry:{inkLoad:{width:8,height:8},solventLoad:{texture:r.waterA}}},sourceB={entry:{inkLoad:{width:8,height:8},solventLoad:{texture:r.waterB}}};
 const draw=()=>r.passes.waterFrontStep(r.field,0,0,24,r.src,r.dst,28,30,.5,1,1);
 const scopes=[];for(const source of [sourceA,sourceB]){const start=r.calls.length;assert.equal(candidate.withSource(source,()=>{assert.equal(r.sandbox[KEY].allWetMobile,false);draw();return'completed'}),'completed');assert.equal(r.sandbox[KEY],undefined);scopes.push(r.calls.slice(start).filter(x=>x.bound).map(x=>x.bound));draw()}
 assert.ok(scopes[0].includes(r.waterA));assert.ok(!scopes[0].includes(r.waterB));assert.ok(scopes[1].includes(r.waterB));assert.ok(!scopes[1].includes(r.waterA));assert.equal(candidate.stats.frontDraws,2);assert.equal(candidate.stats.coreCalls,0);assert.equal(candidate.stats.sourceScopes,2);assert.equal(r.controller.diagnosticRunCore,before);candidate.restore();assert.equal(r.deleted.length,5);assert.throws(()=>candidate.withSource(sourceA,draw),/already restored/);
});
test('interactive source scope restores policy on failure, forbids nesting/async/active restore, then can recover',()=>{
 const r=rig(),candidate=r.installNativeExpansion805(r.engine,null,{noise:false}),source={entry:{inkLoad:{width:8,height:8},solventLoad:{texture:r.waterA}}};
 Object.defineProperty(r.sandbox,KEY,{configurable:true,writable:false,value:undefined});const saved=Object.getOwnPropertyDescriptor(r.sandbox,KEY);
 assert.throws(()=>candidate.withSource(source,()=>{throw Error('target failure')}),/target failure/);assert.deepEqual(Object.getOwnPropertyDescriptor(r.sandbox,KEY),saved);
 assert.throws(()=>candidate.withSource(source,()=>candidate.withSource(source,()=>{})),/nested source scope/);assert.deepEqual(Object.getOwnPropertyDescriptor(r.sandbox,KEY),saved);
 assert.throws(()=>candidate.withSource(source,()=>candidate.restore()),/Cannot restore active/);assert.deepEqual(Object.getOwnPropertyDescriptor(r.sandbox,KEY),saved);
 assert.throws(()=>candidate.withSource(source,()=>Promise.resolve()),/must be synchronous/);assert.deepEqual(Object.getOwnPropertyDescriptor(r.sandbox,KEY),saved);
 assert.throws(()=>candidate.withSource({entry:{}},()=>{}),/missing immutable/);assert.equal(candidate.withSource(source,()=>42),42);candidate.restore();assert.equal(r.deleted.length,5);assert.deepEqual(Object.getOwnPropertyDescriptor(r.sandbox,KEY),saved);
});
test('all-wet reference branch avoids contrast readback and draws exactly raw dry / zero wet P+C',()=>{
 const file=path.join(root,'apps/web/src/engine/src/watercolor/puddle/ContrastPhase.ts'),source=transformNativeExpansion805(file,fs.readFileSync(file,'utf8')),m={exports:{}},clears=[],draws=[],programs=[];let target=null;
 class Buffer{constructor(gl,w,h){this.width=w;this.height=h;this.texture={};}beginReplaceDraw(){target=this}endDraw(){}clear(){clears.push(this)}readPixels(){throw Error('Candidate must not read selection')}destroy(){}}
 const gl=new Proxy({createBuffer:()=>({}),getAttribLocation:()=>0,getUniformLocation:(_,n)=>n,drawArrays:()=>draws.push(target),deleteProgram:p=>programs.push(p)}, {get(o,k){return k in o?o[k]:()=>{}}}),utility={createProgram:(_,vertex,fragment)=>({vertex,fragment})};
 const box={module:m,exports:m.exports,Uint8Array,Math,Float32Array,[KEY]:{allWetMobile:true},require(name){if(name.includes('retainedComponents'))return{retainedComponents(){throw Error('No CPU region filter')}};if(name.includes('PuddleDimensions'))return{puddleLowDimensions:()=>({width:2,height:2})};if(name.includes('AccumulationBuffer'))return{AccumulationBuffer:Buffer};if(name.includes('utils'))return utility;throw Error(name)}};
 vm.runInNewContext(eb.transformSync(source,{loader:'ts',format:'cjs'}).code,box);const phase=m.exports.createContrastPhase(gl,()=>({}),8),p=new Buffer(gl,8,8),c=new Buffer(gl,8,8),w=new Buffer(gl,8,8),rp=new Buffer(gl,8,8),rc=new Buffer(gl,8,8);phase.prepare(p,c,w,true,rp,rc);assert.deepEqual(draws,[rp,rc]);assert.equal(clears.length,1);assert.match(source,/gl_FragColor=raw\*\(1\.-wet\)/);phase.destroy();assert.equal(programs.length,3);
});

test('precombined water is filled once per job and invalidated before the next source',()=>{const r=rig(),c=r.installNativeExpansion805(r.engine,r.controller,{noise:false,precombineWater:true});r.controller.diagnosticRunCore();assert.equal(c.stats.waterMaskDraws,1);r.controller.diagnosticRunCore();assert.equal(c.stats.waterMaskDraws,1);c.invalidateWater();r.controller.diagnosticRunCore();assert.equal(c.stats.waterMaskDraws,2);assert.equal(r.sandbox[KEY],undefined);c.restore()});

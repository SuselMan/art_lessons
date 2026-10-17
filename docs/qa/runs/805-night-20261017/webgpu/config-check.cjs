// NODE_PATH=<existing compatible node_modules> node .../webgpu/config-check.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const base=path.resolve(__dirname,'../../../prototypes/805-algorithm-search/webgpu'),cache=new Map();
function load(name){let file=path.resolve(base,name);if(!file.endsWith('.ts'))file+='.ts';if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('module','exports','require',js)(m,m.exports,id=>{assert.ok(id.startsWith('.'));return load(path.relative(base,path.resolve(path.dirname(file),id)))});return m.exports}
const {definitions}=load('index'),definition=definitions.find(d=>d.id==='wgsl-d2q9-bgk');
assert.deepEqual(definition.configs.slice(0,2),[{grid:256,steps:48},{grid:512,steps:48}]);
assert.deepEqual(definition.configs.slice(2),[{grid:256,steps:16,diffusion:0.015},{grid:128,steps:24,diffusion:0.025}]);
assert.equal(definitions.length,3);for(const c of definition.configs){assert.equal(1024%c.grid,0);assert.ok(c.steps>=1&&c.steps<=256);assert.ok((c.diffusion??0.12)>=0&&(c.diffusion??0.12)<=0.24)}
console.log('PASS: original configs preserved; two parameter experiments, no new algorithms/kernels')

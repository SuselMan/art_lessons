const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),esbuild=require('/home/suselman/projects/pencil-agents/805-watercolor-search/node_modules/esbuild');
const out=path.join(process.env.QA_TEMP_ROOT||'/home/suselman/.cache/codex-qa/flow-805-night-20261018','exact-program-test.cjs');
esbuild.buildSync({entryPoints:[path.join(__dirname,'exact-program.ts')],bundle:true,platform:'node',outfile:out});const {exactProgramSource,fastDivideSource}=require(out);
for(let program=0;program<4;program++){
 const s=exactProgramSource(program);assert.equal(s.includes('fn exactBoundedDiv'),!!(program&2));assert.equal(s.includes('dst[ia]=adsorb(a,aux[ia])'),!!(program&1));
 if(program&2)assert.equal((s.match(/exactBoundedDiv\(/g)||[]).length,6)
}
assert.throws(()=>fastDivideSource('changed'));assert.throws(()=>exactProgramSource(4));fs.unlinkSync(out);console.log(JSON.stringify({pass:true,programs:4,safeDivisionSites:5,scope:'Source transformation anchors; GPU equivalence and speed pending'}));

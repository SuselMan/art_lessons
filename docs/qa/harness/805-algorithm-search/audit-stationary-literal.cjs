'use strict'
// CPU audit of physical-device raw carriers; launches no browser or GPU.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict')
const source=path.resolve(__dirname,'../../prototypes/805-algorithm-search/stress-flow-fixtures.ts'),esbuild=require('/home/suselman/projects/pencil-agents/805-watercolor-search/node_modules/esbuild'),m={exports:{}}
vm.runInNewContext(esbuild.buildSync({entryPoints:[source],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text,{module:m,exports:m.exports,Uint8Array})
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),file=path.resolve(process.argv[2]),report=JSON.parse(fs.readFileSync(file)),rows=[]
assert.equal(report.pass,true);assert.equal(report.sourceStable,true);assert.equal(report.contextClosed,true)
for(const row of report.cases){
 const r=row.result;if(!r.fixture.startsWith('stress-stationary-phase-a'))continue
 assert.equal(row.pass,true);const input=m.exports.createStressFlowFixture(r.fixture)
 for(const field of['rgba','water','paper'])assert.equal(hash(input[field]),r.fixtureSHA[field],'Input mismatch '+field)
 const output=zlib.gunzipSync(fs.readFileSync(path.join(path.dirname(file),row.carrier.file)))
 assert.equal(hash(output),row.carrier.decodedSHA256);assert.equal(hash(output),r.hashes[0]);assert.equal(output.length,input.rgba.length)
 let pixels=0,violations=0,opaqueDifferent=0;const minDelta=[255,255,255,255]
 for(let i=0;i<input.water.length;i++)if(input.water[i]===0&&input.rgba[i*4+3]>0){
  pixels++;let different=false
  for(let c=0;c<4;c++){const delta=output[i*4+c]-input.rgba[i*4+c];minDelta[c]=Math.min(minDelta[c],delta);if(delta<0)violations++;different||=delta!==0}
  if(input.rgba[i*4+3]===255&&different)opaqueDifferent++
 }
 assert.equal(pixels,64);assert.equal(violations,0,'Literal stationary material removed');assert.equal(opaqueDifferent,0,'Opaque literal changed')
 rows.push({fixture:r.fixture,algorithm:r.algorithm,outputSHA:r.hashes[0],pixels,minDeltaRGBA:minDelta,violations,opaqueDifferent})
}
assert.equal(rows.length,10,'Expected five opacity controls for two models')
const result={qualification:'Same captured raw output and regenerated SHA-matching inputs. Dry literal RGBA lower bound; opaque literal exact. Does not prove no new wet pigment may arrive at semitransparent dry pixels.',sourceSHA:hash(fs.readFileSync(source)),rows,pass:true}
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2));else process.stdout.write(JSON.stringify(result,null,2)+'\n')

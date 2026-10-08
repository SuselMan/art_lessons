import{mkdir,copyFile,cp,readFile,writeFile}from'node:fs/promises'
import path from'node:path'
const source=process.argv[2],out=process.argv[3]??'temp/gl-gpu-coverage'
if(!source)throw Error('Usage: build.mjs frozenEngineBundle out')
await mkdir(out,{recursive:true})
for(const name of ['run.js','provenance.json'])await copyFile(path.join(source,name),path.join(out,name))
await cp(path.join(source,'paper'),path.join(out,'paper'),{recursive:true})
await copyFile('docs/qa/harness/728-gpu-method-timer/timer.mjs',path.join(out,'timer.mjs'))
const coverage=await readFile('docs/qa/harness/728-gl-gpu-coverage/run.mjs','utf8')
await writeFile(path.join(out,'coverage.mjs'),coverage.replace('../728-gpu-method-timer/timer.mjs','./timer.mjs'))
await copyFile('docs/qa/harness/728-gl-gpu-coverage/index.html',path.join(out,'index.html'))

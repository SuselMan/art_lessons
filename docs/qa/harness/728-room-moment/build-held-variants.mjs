import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import { build } from 'esbuild'
import { mkdir,writeFile,readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const out=resolve(process.argv[2]??'temp/day-728/held-stamp-variants')
await mkdir(out,{recursive:true})
await build({entryPoints:['docs/qa/harness/728-room-moment/heldStampVariantsRun.ts'],bundle:true,format:'esm',outfile:resolve(out,'run.js'),plugins:[{name:'raw',setup(b){b.onResolve({filter:/\?raw$/},args=>({path:resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await(await import('node:fs/promises')).readFile(args.path,'utf8'),loader:'text'}))}}]})
await writeFile(resolve(out,'index.html'),'<!doctype html><meta charset="utf-8"><title>Actual held stamp factor diagnostic</title><script type="module">import {runHeldStampVariants} from "./run.js"; window.runHeldStampVariants=runHeldStampVariants;</script>')

const sha=b=>createHash('sha256').update(b).digest('hex')
const files={};for(const name of ['run.js','index.html']){const bytes=await readFile(resolve(out,name));files[name]={bytes:bytes.length,sha256:sha(bytes)}}
const inputs={};for(const name of ['docs/qa/harness/728-room-moment/heldStampFactors.ts','docs/qa/harness/728-room-moment/heldStampVariants.ts','apps/web/src/engine/src/webgpuCanonical/stamp.ts','apps/web/src/engine/src/webgpuCanonical/noise.ts','apps/web/src/engine/src/raster/watercolorNoise.txt']){const bytes=await readFile(name);inputs[name]={bytes:bytes.length,sha256:sha(bytes)}}
await writeFile(resolve(out,'manifest.json'),JSON.stringify({sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),files,inputs,uniformSource:'Actual queued first-purple stamp from source5359 census; fixture in heldStampFactors.ts',noise:{dimensions:[251,251],encoding:'Production base64 u8 lattice expanded to equal RGBA RGB, A255'},roi:{x:384,yTop:352,w:96,h:96},decodedBudgetBytes:1327104,scope:'Standalone diagnostic only; no Room/physical latency/quality claim'},null,2))

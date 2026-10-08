import { build } from 'esbuild'
import { mkdir,writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const out=resolve(process.argv[2]??'temp/day-728/held-stamp-factors')
await mkdir(out,{recursive:true})
await build({entryPoints:['docs/qa/harness/728-room-moment/heldStampFactorsRun.ts'],bundle:true,format:'esm',outfile:resolve(out,'run.js'),plugins:[{name:'raw',setup(b){b.onResolve({filter:/\?raw$/},args=>({path:resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await(await import('node:fs/promises')).readFile(args.path,'utf8'),loader:'text'}))}}]})
await writeFile(resolve(out,'index.html'),'<!doctype html><meta charset="utf-8"><title>Actual held stamp factor diagnostic</title><script type="module">import {runHeldStampFactors} from "./run.js"; window.runHeldStampFactors=runHeldStampFactors;</script>')

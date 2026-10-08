import {stampBuildCode} from './buildProvenance.mjs'
import { build } from 'esbuild'
import { readFile, mkdir, cp, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
const root=process.cwd(), out=path.resolve(process.argv[2]??'temp/native-end-to-end')
const paper=process.argv[3]??path.join(root,'apps/web/public/paper')
const entry=path.join(root,'docs/qa/harness/728-native-end-to-end/run.ts')
const code=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()+(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()?' + dirty':'')
await mkdir(out,{recursive:true})
await build({entryPoints:[entry],outfile:path.join(out,'run.js'),bundle:true,format:'esm',target:'es2020',sourcemap:true,
  alias:{'@grafetto/shared':path.join(root,'packages/shared/src/index.ts')},define:{'import.meta.env.DEV':'false','import.meta.env.PROD':'true'},
  plugins:[{name:'raw-text',setup(b){b.onResolve({filter:/\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw-text'}));b.onLoad({filter:/.*/,namespace:'raw-text'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))}}]})
let js=await readFile(path.join(out,'run.js'),'utf8');await writeFile(path.join(out,'run.js'),stampBuildCode(js,code))
await cp(path.join(root,'docs/qa/harness/728-native-end-to-end/index.html'),path.join(out,'index.html'))
await cp(paper,path.join(out,'paper'),{recursive:true})
await writeFile(path.join(out,'provenance.json'),JSON.stringify({code,build:'esbuild bundle actual engine, no backend/Room',paperAssets:paper},null,2))
console.log(out)

import { build } from 'esbuild'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
const root=fileURLToPath(new URL('../../../',import.meta.url))
const output=root+'temp/qa-disposable/mini-stand-build'
let html=await readFile(root+'docs/qa/prototypes/mini-stand/index.html','utf8')
let source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
source=source.replaceAll("'/src/", "'"+root+"apps/web/src/")
source=source.replace("await import(/* @vite-ignore */ (version==='1'?'__MINI_PUDDLE_MODULE_V01__':version==='4'?'__MINI_PUDDLE_MODULE_V04__':version==='3'?'__MINI_PUDDLE_MODULE_V03__':'__MINI_PUDDLE_MODULE__'))",`(version==='1'?await import('${root}docs/qa/prototypes/mini-puddle/controller-v01.ts'):version==='4'?await import('${root}docs/qa/prototypes/mini-puddle/controller-v04.ts'):version==='3'?await import('${root}docs/qa/prototypes/mini-puddle/controller-v03.ts'):await import('${root}docs/qa/prototypes/mini-puddle/controller-v02.ts'))`)
// Device bridge remains on the explicit dev route, never part of this static bundle.
source=source.replace("if(deviceSmoke){await import('/@vite/client');(await import('"+root+"apps/web/src/dev/devBridge.ts')).startDevBridge();}",'')
const result=await build({stdin:{contents:source,resolveDir:root+'apps/web',sourcefile:'mini-entry.ts',loader:'ts'},entryPoints:[root+'apps/web/src/engine/index.ts'],bundle:true,splitting:true,format:'esm',platform:'browser',target:'es2022',minify:true,write:false,outdir:output,entryNames:'mini-[hash]',chunkNames:'chunk-[hash]',define:{'import.meta.env.DEV':'true','import.meta.env.PROD':'false','import.meta.env.BASE_URL':'"/"','import.meta.env.MODE':'"http"'},metafile:true})
await mkdir(output,{recursive:true})
for(const f of result.outputFiles){await writeFile(f.path,f.contents);await writeFile(f.path+'.gz',gzipSync(f.contents))}
const entry=Object.entries(result.metafile.outputs).find(([,v])=>v.entryPoint==='mini-entry.ts')?.[0]??Object.keys(result.metafile.outputs).find(k=>/mini-[^/]+\.js$/.test(k))
if(!entry)throw Error('Missing entry')
html=html.replace(/<script type="module">[\s\S]*?<\/script>/,`<script type="module" src="/mini-assets/${entry.split('/').pop()}"></script>`)
const paper=JSON.parse(await readFile(root+'apps/web/public/paper/manifest.json','utf8')).assets.fine.texture
html=html.replace('<title>',`<link rel="preload" as="fetch" href="/paper/${paper}" crossorigin><title>`)
await writeFile(output+'/index.html',html)
console.log(JSON.stringify({entry,files:result.outputFiles.length,bytes:result.outputFiles.reduce((n,f)=>n+f.contents.length,0)}))

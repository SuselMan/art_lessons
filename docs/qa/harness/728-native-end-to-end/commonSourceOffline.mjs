import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import zlib from 'node:zlib'
import {chromium} from 'playwright'
const [bundleArg,outputArg,arm='producer']=process.argv.slice(2)
if(!bundleArg||!outputArg||!['producer','baseline','common'].includes(arm))throw Error('Usage: node commonSourceOffline.mjs BUNDLE OUTPUT producer|baseline|common')
const bundle=path.resolve(bundleArg),output=path.resolve(outputArg),sha=b=>crypto.createHash('sha256').update(b).digest('hex')
const provenance=JSON.parse(fs.readFileSync(path.join(bundle,'provenance.json'))),js=fs.readFileSync(path.join(bundle,'run.js'))
if(!/^[a-f0-9]{40}$/.test(provenance.code)||/__SOURCE_CODE__|__CODE__/.test(js.toString()))throw Error('Unfrozen source passport')
fs.mkdirSync(output,{recursive:true})
if(fs.statfsSync(output).bavail*fs.statfsSync(output).bsize<512*1024*1024)throw Error('Disk guard: need512MiB free')
const artifact=path.join(output,'checkpoint.json'),reportPath=path.join(output,arm+'-report.json')
if(fs.existsSync(reportPath))throw Error('Immutable report already exists')
if(arm==='producer'&&fs.existsSync(artifact))throw Error('Checkpoint already exists; never recapture GL')
const report={code:provenance.code,bundleSha256:sha(js),softwareOnly:true,arm,stage:'preflight',valid:false,errors:[]},save=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2))
save()
const server=http.createServer((req,res)=>{const file=path.resolve(bundle,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(bundle+'/'))return res.writeHead(403).end();try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(file.endsWith('/')?file+'index.html':file))}catch{res.writeHead(404).end()}})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
let browser
try{
 browser=await chromium.launch({headless:true,args:['--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface']})
 const page=await browser.newPage();page.on('console',m=>{if(m.text().startsWith('COMMON_SOURCE')){report.progress=m.text();save()}});page.on('pageerror',e=>{report.errors.push(String(e));save()})
 const chunkFiles=new Set()
 await page.exposeFunction('writeCheckpointChunk',async(meta,base64)=>{if(!/^source-\d+\.rgba\.gz$|^gl-final\.rgba\.gz$/.test(meta.name)||chunkFiles.has(meta.name))throw Error('Unsafe/duplicate chunk');const bytes=Buffer.from(base64,'base64');if(bytes.length!==meta.gzipBytes||sha(bytes)!==meta.gzipSha256)throw Error('Compressed chunk mismatch');const raw=zlib.gunzipSync(bytes,{maxOutputLength:4194304});if(raw.length!==meta.rawBytes||sha(raw)!==meta.rawSha256)throw Error('Raw chunk mismatch');fs.writeFileSync(path.join(output,meta.name),bytes,{flag:'wx'});chunkFiles.add(meta.name);report.persistedChunks=chunkFiles.size;save()})
 await page.exposeFunction('readCheckpointChunk',file=>{if(!/^source-\d+\.rgba\.gz$|^gl-final\.rgba\.gz$/.test(file))throw Error('Unsafe chunk path');return fs.readFileSync(path.join(output,file)).toString('base64')})
 await page.goto('http://127.0.0.1:'+server.address().port+'/index.html')
 await page.waitForFunction(()=>typeof prepareCommonSourceCheckpoint==='function'&&typeof runCommonSourceSolver==='function')
 const operation=JSON.parse(fs.readFileSync('docs/qa/harness/728-native-end-to-end/sourceReplay.fixture.json')).operation
 report.stage='running';save()
 const packed=arm==='producer'?null:JSON.parse(fs.readFileSync(artifact));if(packed&&packed.code!==provenance.code)throw Error('Checkpoint source mismatch')
 const work=page.evaluate(async({operation,packed,arm})=>{const encode=b=>{let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(s)};if(arm==='producer'){const c=await prepareCommonSourceCheckpoint({operation,timeoutMs:300000});return persistCommonSourceCheckpoint(c,(meta,b)=>writeCheckpointChunk(meta,encode(b)))}const c=await restoreCommonSourceCheckpoint(packed,async file=>Uint8Array.from(atob(await readCheckpointChunk(file)),x=>x.charCodeAt(0)));return runCommonSourceSolver({operation,checkpoint:c,commonSource:arm==='common'})},{operation,packed,arm})
 const result=await Promise.race([work,new Promise((_,reject)=>setTimeout(()=>reject(Error('Bounded '+arm+' timeout')),arm==='producer'?360000:300000).unref())])
 if(result.code!==provenance.code)throw Error('Result source mismatch')
 if(arm==='producer'){if(result.chunks.length!==chunkFiles.size)throw Error('Manifest chunk count mismatch');fs.writeFileSync(artifact,JSON.stringify(result),{flag:'wx'});report.checkpointSha256=sha(fs.readFileSync(artifact));report.sourcePhysicalBytes=result.payload.physicalBytes}else report.result=result
 report.valid=!report.errors.length;report.stage='complete'
}catch(e){report.error=String(e);report.stage='failed';process.exitCode=1}finally{save();await browser?.close();server.close()}

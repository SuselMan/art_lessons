import {chromium} from 'playwright'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
const dir=process.env.QA_BUNDLE,out=process.env.QA_OUT
if(!dir||!out)throw Error('Explicit persistent QA_BUNDLE/QA_OUT required')
const server=http.createServer((q,r)=>{const name=new URL(q.url,'http://localhost').pathname.slice(1)||'index.html';if(!['run.js','index.html'].includes(name)){r.writeHead(404);r.end();return}r.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');r.end(fs.readFileSync(path.join(dir,name)))})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
let browser
const watchdog=setTimeout(()=>{report.error='Bounded60s software preflight timeout';void browser?.close()},60000)
const report={scope:'VPS SwiftShader pipeline/layout preflight ONLY, not real device performance/quality',arms:[],errors:[]}
try{
 browser=await chromium.launch({headless:true,args:['--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface']})
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(String(e)))
 await page.goto('http://127.0.0.1:'+server.address().port)
 for(const args of [[false,false,true,false,true,false],[false,false,true,true,true,false],[true,false,false,false,true,false],[true,false,true,false,true,false],[true,true,false,true,true,false],[true,true,true,true,true,false],[true,false,false,true,true,true],[true,false,true,true,true,true]]){
  const result=await page.evaluate(async args=>{const module=await import('./run.js');return module.runMomentTextureGate(...args)},process.env.QA_STAGE_CAPTURE==='1'?[...args,true]:args)
  report.arms.push(result);fs.writeFileSync(out,JSON.stringify(report,null,2))
  if(!result.valid)throw Error('Vector software arm FAIL')
 }
 report.valid=report.arms.length===8&&report.errors.length===0
}catch(error){report.error=String(error);report.valid=false;process.exitCode=1}
finally{clearTimeout(watchdog);await browser?.close();await new Promise(r=>server.close(r));fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({out,valid:report.valid,error:report.error,arms:report.arms.length}))}

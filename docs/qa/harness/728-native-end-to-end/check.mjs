import { chromium } from 'playwright'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const root=path.resolve(process.argv[2]??'temp/native-end-to-end'),size=Number(process.argv[3]??100)
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+'/'))return res.writeHead(403).end();try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file))}catch{res.writeHead(404).end()}})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface']})
const errors=[]
try{const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.text().startsWith('E2E'))console.log(m.text())});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>typeof window.runEndToEnd==='function');let watchdog;const result=await Promise.race([page.evaluate(async size=>window.runEndToEnd({size,allowLarge:size===400}),size),new Promise((_,reject)=>{watchdog=setTimeout(()=>reject(new Error('Full end-to-end watchdog timeout (10 minutes)')),600000)})]).finally(()=>clearTimeout(watchdog));fs.writeFileSync(root+'/latest-'+size+'.json',JSON.stringify({errors,result},null,2));console.log(JSON.stringify({errors,result:{...result,tape:result.tape?.map(x=>({id:x.id,type:x.type,wet:x.wet}))}}));if(errors.length||result.errors?.length||result.lost||result.glError)process.exitCode=1}
catch(error){fs.writeFileSync(root+'/failure-'+size+'.json',JSON.stringify({errors,failure:String(error)},null,2));throw error}
finally{await browser.close();await new Promise(resolve=>server.close(resolve))}

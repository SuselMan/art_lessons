import { chromium } from 'playwright'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve('temp/webgpu-native-dist')
const server = http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+'/')){res.writeHead(403).end();return}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(file))}catch{res.writeHead(404).end()}})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser = await chromium.launch({headless:true,args:['--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface']})
const errors=[];const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
try {await page.goto(`http://127.0.0.1:${server.address().port}/webgpu-native-stage.html`);await page.waitForFunction(()=>window.__canonicalStage,null,{timeout:20000});const result=await page.evaluate(()=>window.__canonicalStage);fs.mkdirSync('temp/native-owner-gate',{recursive:true});fs.writeFileSync('temp/native-owner-gate/latest.json',JSON.stringify({errors,result},null,2));console.log(JSON.stringify({errors,result}));if(result.ownerRetirementChanged||result.scissorOutsideChanged||result.ownerOrderingChanged||result.ownerGlRegionChanged||!result.ownerPoolReused||!result.ownerFilterExact||errors.length||result.gpuErrors.length||result.copyClearChanged||result.copyRegionChanged||result.phaseChanged||result.zeroBrushChanged||!result.activeBrushChanged||result.activeBrushMassDelta.some(d=>d!==0)||!result.nonzero.pigment||!result.nonzero.coverage||!result.nonzero.color)process.exitCode=1}catch(error){console.log(JSON.stringify({errors,failure:String(error)}));throw error}finally{await browser.close();await new Promise(r=>server.close(r))}

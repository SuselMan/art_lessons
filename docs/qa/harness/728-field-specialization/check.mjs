import {chromium} from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
const dir='temp/field-specialization';
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(dir+'/'+name));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface']});
try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.runFieldSpecialization);const report=await page.evaluate(async()=>({softwareOnly:true,...await window.runFieldSpecialization()}));fs.writeFileSync(dir+'/latest-software.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.exact||report.errors.length)process.exitCode=1;}finally{await browser.close();await new Promise(r=>server.close(r));}

import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const root=path.resolve('temp/webgpu-poc-dist');const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+'/')){res.writeHead(403).end();return}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end()}});await new Promise(r=>server.listen(5349,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface','--ignore-certificate-errors']});
const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1400,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
try {
await page.goto('http://127.0.0.1:5349/webgpu-poc.html');await page.waitForTimeout(2500);
console.log(await page.locator('[role=status]').textContent());
await page.getByRole('button',{name:'Dense zigzag',exact:true}).click({timeout:5000});await page.waitForTimeout(1200);
await page.getByRole('button',{name:'Pause',exact:true}).click();
await page.screenshot({path:'temp/webgpu-poc/software-zigzag.png',fullPage:true});
await page.getByRole('button',{name:'Check replay bytes',exact:true}).click();await page.waitForTimeout(7000);
console.log(await page.locator('[role=status]').textContent());
console.log(await page.evaluate(async()=>{const pixels=await window.__watercolorGpuPoc.readPixels();let colored=0;for(let k=0;k<pixels.rgba.length;k+=4)if(Math.max(pixels.rgba[k],pixels.rgba[k+1],pixels.rgba[k+2])-Math.min(pixels.rgba[k],pixels.rgba[k+1],pixels.rgba[k+2])>10)colored++;const c=document.createElement('canvas');c.width=pixels.width;c.height=pixels.height;c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels.rgba),c.width,c.height),0,0);document.body.append(c);const s=await window.__watercolorGpuPoc.readState();let mass=0,mobile=0,water=0,max=0;for(let k=0;k<s.length;k+=16){mass+=s[k+3]+s[k+7];mobile+=s[k+3];water+=s[k+8];max=Math.max(max,s[k+3]+s[k+7]);}return{mass,mobile,water,max,colored};}));
await page.screenshot({path:'temp/webgpu-poc/software-readback.png',fullPage:true});
console.log(await page.evaluate(()=>window.__watercolorGpuPoc.checkOracle()));
console.log(JSON.stringify({errors,body:await page.locator('body').innerText()}));
fs.writeFileSync('temp/webgpu-poc/software-check.json',JSON.stringify({errors,status:await page.locator('[role=status]').textContent()}));
}finally{await browser.close();server.close()}

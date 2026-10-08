import{compareColourSnapshot}from'./run.mjs'
import {chromium} from 'playwright'
import fs from 'node:fs'
import http from 'node:http'
const dir='temp/gl-colour-snapshot'
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';try{res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.json')?'application/json':name.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(dir+'/'+name))}catch{res.statusCode=404;res.end()}})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],timeout:30000})
try{
 const page=await browser.newPage();page.setDefaultTimeout(240000);const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)))
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.runPrototype)
 const rows=[]
 for(const scenario of ['single400','mixed400']){
  const arms=[]
  for(const enabled of [false,true]){
   const result=await page.evaluate(async({scenario,enabled})=>{try{return await window.runPrototype({backend:'webgl1',scenario,paper:'fine',pageWidth:2048,skipSinglePaintColourSnapshot:enabled,verifyUndo:false})}finally{window.disposePrototype()}},{scenario,enabled})
   arms.push(result);fs.writeFileSync(dir+'/software-progress.json',JSON.stringify({rows,scenario,arms,pageErrors},null,2))
   console.log(JSON.stringify({scenario,enabled,paintMs:result.paintMs,counters:result.colourSnapshot,error:result.glError,lost:result.lost}))
  }
  rows.push({...compareColourSnapshot(...arms,scenario),arms})
 }
 const valid=rows.every(r=>r.valid)&&!pageErrors.length
 fs.writeFileSync(dir+'/software.json',JSON.stringify({softwareOnly:true,valid,rows,pageErrors},null,2));console.log(JSON.stringify({valid,rows:rows.map(({scenario,fieldsExact,materialExact,exportExact,tapeExact,exercised})=>({scenario,fieldsExact,materialExact,exportExact,tapeExact,exercised}))}));if(!valid)process.exitCode=1
}finally{await browser.close();await new Promise(r=>server.close(r))}

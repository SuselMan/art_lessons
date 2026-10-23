import WebSocket from '/home/suselman/projects/pencil-agents/680-device-qa-guards/node_modules/ws/wrapper.mjs';
import {writeFileSync} from 'node:fs';
const pages=await(await fetch('http://127.0.0.1:9460/json/list')).json();
const page=pages.find(p=>p.type==='page'&&p.url.includes('qa=surface728-product67'));
if(!page)throw Error('Own Surface page absent');
const ws=new WebSocket(page.webSocketDebuggerUrl);let id=0;const pending=new Map();
ws.on('message',b=>{const d=JSON.parse(b);if(d.id&&pending.has(d.id)){const f=pending.get(d.id);pending.delete(d.id);d.error?f.reject(Error(JSON.stringify(d.error))):f.resolve(d.result)}});
await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error(method+' timeout'))},30000);pending.set(n,{resolve:x=>{clearTimeout(timer);resolve(x)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id:n,method,params}))});
try{
 await call('Page.bringToFront');
 await call('Security.setIgnoreCertificateErrors',{ignore:true});
 if(process.argv[2]==='boot'){await call('Security.setIgnoreCertificateErrors',{ignore:true});await call('Page.navigate',{url:page.url});}
 if(process.argv[2]==='shot'){const shot=await call('Page.captureScreenshot',{format:'png'});writeFileSync(new URL('./surface-product67-screen.png',import.meta.url),Buffer.from(shot.data,'base64'));console.log('own screenshot saved');} else {
 const expression=process.argv[2]==='boot'?'({url:location.href,ready:document.readyState,text:document.body?.innerText?.slice(0,1200)})':process.argv[2];
 const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 writeFileSync(new URL('./surface-product67-last.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),target:page.id,result},null,2));console.log(JSON.stringify(result));
 }
}finally{ws.close()}

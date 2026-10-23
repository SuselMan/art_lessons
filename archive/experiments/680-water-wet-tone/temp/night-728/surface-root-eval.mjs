import WebSocket from '/home/suselman/projects/pencil-agents/680-device-qa-guards/node_modules/ws/wrapper.mjs';
import {writeFileSync} from 'node:fs';
const pages=await(await fetch('http://127.0.0.1:9442/json/list')).json();
const p=pages.find(x=>x.type==='page'&&x.url.includes('qa=surface728'));
if(!p)throw Error('Owned page absent');
const ws=new WebSocket(p.webSocketDebuggerUrl.replace('127.0.0.1:9339','127.0.0.1:9442'));let id=0;const pending=new Map();
ws.on('message',b=>{const d=JSON.parse(b);if(d.id&&pending.has(d.id)){const f=pending.get(d.id);pending.delete(d.id);d.error?f.reject(Error(JSON.stringify(d.error))):f.resolve(d.result)}});
await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error(method+' timeout'))},15000);pending.set(n,{resolve:x=>{clearTimeout(timer);resolve(x)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id:n,method,params}))});
try{
 await call('Page.bringToFront');
 
 const r=await call('Runtime.evaluate',{expression:process.argv[2],returnByValue:true});
 writeFileSync(new URL('./surface-root-cdp-last.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),target:p.id,result:r},null,2));console.log(JSON.stringify(r));
}finally{ws.close()}

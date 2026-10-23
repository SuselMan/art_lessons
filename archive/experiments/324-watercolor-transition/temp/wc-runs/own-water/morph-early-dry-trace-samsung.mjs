import WebSocket from 'ws';import fs from 'node:fs';
const base='http://127.0.0.1:9233';
const pages=await(await fetch(base+'/json/list')).json();
const target=pages.find(p=>p.url.includes(':5313/morph-review.html'));
if(!target)throw Error('Own morph QA page missing');
fs.writeFileSync('temp/wc-runs/own-water/morph-qa-tab.json',JSON.stringify({id:target.id,url:target.url}));
const s=new WebSocket(target.webSocketDebuggerUrl);await new Promise((ok,no)=>{s.once('open',ok);s.once('error',no)});
let seq=0;const pending=new Map();
s.on('message',data=>{const r=JSON.parse(data);if(r.id&&pending.has(r.id)){const p=pending.get(r.id);clearTimeout(p.timer);pending.delete(r.id);r.error?p.no(Error(r.error.message)):p.ok(r.result)}});
const send=(method,params={})=>new Promise((ok,no)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);no(Error('Timeout '+method))},180000);pending.set(id,{ok,no,timer});s.send(JSON.stringify({id,method,params}))});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
try{await send('Page.bringToFront');await ev('(async()=>{for(let i=0;i<100&&!window.review?.ready;i++)await new Promise(r=>setTimeout(r,100));if(!window.review?.ready)throw Error("Review not ready")})()');const expression=fs.readFileSync('/home/suselman/projects/pencil-agents/324-live-spread-morph/temp/engine-morph/early-dry-trace.js','utf8');const result=await ev(expression);fs.writeFileSync('temp/wc-runs/own-water/morph-early-dry-trace-samsung.json',JSON.stringify(result,null,2));console.log(JSON.stringify({saved:true,keys:Object.keys(result)}));}finally{s.close()}

import WebSocket from 'ws';
import fs from 'node:fs';
const base='http://127.0.0.1:9233';
const pages=await(await fetch(base+'/json/list')).json();
const target=pages.find(p=>p.url.includes(':5296/create?qa=root-solvent-20261006'));
if(!target)throw Error('Own origin QA page missing');
fs.writeFileSync('temp/wc-runs/own-water/solvent-qa-tab.json',JSON.stringify({id:target.id,url:target.url}));
const s=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok,no)=>{s.once('open',ok);s.once('error',no)});
let seq=0;const pending=new Map();
s.on('message',data=>{const r=JSON.parse(data);if(r.id&&pending.has(r.id)){const p=pending.get(r.id);clearTimeout(p.timer);pending.delete(r.id);r.error?p.no(Error(r.error.message)):p.ok(r.result)}});
const send=(method,params={})=>new Promise((ok,no)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);no(Error('Timeout '+method))},120000);pending.set(id,{ok,no,timer});s.send(JSON.stringify({id,method,params}))});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
const cases=JSON.parse(fs.readFileSync('temp/wc-runs/own-water/solvent-small-cases.json','utf8'));
const fn=fs.readFileSync('temp/wc-runs/own-water/solvent-qa-page.js','utf8');
const rows=[];
try{await send('Page.bringToFront');for(const test of cases){const r=await ev(`(${fn})(${JSON.stringify(test)})`);fs.writeFileSync('temp/wc-runs/own-water/solvent-'+test.name+'-samsung.png',Buffer.from(r.png,'base64'));delete r.png;rows.push({name:test.name,...r});console.log(JSON.stringify(rows.at(-1)));fs.writeFileSync('temp/wc-runs/own-water/solvent-samsung.json',JSON.stringify(rows,null,2));}}
finally{s.close()}

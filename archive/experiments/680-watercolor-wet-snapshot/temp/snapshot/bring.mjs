import WebSocket from 'ws';
const ws=new WebSocket('ws://127.0.0.1:9238/devtools/page/1145');const pending=new Map();let seq=0;
ws.on('message',b=>{const m=JSON.parse(String(b));if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}});
await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
const send=(method,params={})=>new Promise(r=>{const id=++seq;pending.set(id,r);ws.send(JSON.stringify({id,method,params}))});
try{console.log(await send('Page.bringToFront'));console.log(await Promise.race([send('Runtime.evaluate',{expression:'JSON.stringify({href:location.href,visibility:document.visibilityState,engine:!!window.__engine,body:document.body.innerText.slice(0,250)})',returnByValue:true}),new Promise(r=>setTimeout(()=>r('eval timeout'),10000))]));}finally{ws.close()}

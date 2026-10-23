import WebSocket from 'ws'
const [id,method,raw='{}']=process.argv.slice(2)
const targets=await (await fetch('http://127.0.0.1:19223/json/list')).json(),t=targets.find(t=>t.id===id)
if(!t)throw Error('Missing CDP target')
await new Promise((resolve,reject)=>{const w=new WebSocket(t.webSocketDebuggerUrl),timer=setTimeout(()=>{w.close();reject(Error('CDP timeout'))},15000);w.on('open',()=>w.send(JSON.stringify({id:1,method,params:JSON.parse(raw)})));w.on('error',reject);w.on('message',raw=>{const r=JSON.parse(raw);if(r.id===1){clearTimeout(timer);console.log(JSON.stringify(r.result??r.error));w.close();resolve()}})})

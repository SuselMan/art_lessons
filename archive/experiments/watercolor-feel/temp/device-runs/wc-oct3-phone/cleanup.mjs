import WebSocket from 'ws';
const base='http://localhost:9223';
const tabs=await(await fetch(base+'/json/list')).json();
const own=tabs.filter(t=>t.url.includes('qa-brush-drag='));
const target=own[0]||tabs.find(t=>t.type==='page'&&t.webSocketDebuggerUrl);
if(target){const ws=new WebSocket(target.webSocketDebuggerUrl);try{await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});await new Promise((r,j)=>{const timer=setTimeout(()=>j(new Error('security reset timeout')),5000);ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id===1){clearTimeout(timer);m.error?j(new Error(m.error.message)):r()}});ws.send(JSON.stringify({id:1,method:'Security.setIgnoreCertificateErrors',params:{ignore:false}}))});console.log('certificate bypass reset')}finally{ws.close()}}
for(const t of own)await fetch(base+'/json/close/'+t.id).catch(()=>{});
console.log('closed own QA tabs',own.length);

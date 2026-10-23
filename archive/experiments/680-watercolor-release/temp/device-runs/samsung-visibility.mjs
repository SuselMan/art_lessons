import WebSocket from 'ws';
const targets=await(await fetch('http://127.0.0.1:9238/json/list')).json();
const selected=targets.filter(t=>['1164','1166','1121','1143','1150','1131','1110','1106','1090'].includes(t.id));
const out=await Promise.all(selected.map(t=>new Promise(resolve=>{
 const ws=new WebSocket(t.webSocketDebuggerUrl); const timer=setTimeout(()=>{ws.terminate();resolve({id:t.id,timeout:true})},3000);
 ws.on('open',()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:'JSON.stringify({url:location.href,visible:document.visibilityState,ready:document.readyState,engine:!!window.__engine,ua:navigator.userAgent})',returnByValue:true}})));
 ws.on('message',s=>{const j=JSON.parse(s);if(j.id===1){clearTimeout(timer);ws.close();resolve({id:t.id,result:j.result?.result?.value,error:j.error})}});
 ws.on('error',e=>{clearTimeout(timer);resolve({id:t.id,error:e.message})});
})));
console.log(JSON.stringify(out));

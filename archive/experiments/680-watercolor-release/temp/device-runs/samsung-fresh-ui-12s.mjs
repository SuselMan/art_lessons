import WebSocket from 'ws';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:9238', url='https://192.168.1.70:5308/room/hHDBT4c4?qa=codex-root-fresh-'+Date.now();
const old=new Set((await(await fetch(base+'/json/list')).json()).map(x=>x.id));let target,ws;
const report={url};
try {
 execFileSync('/home/suselman/.local/bin/home-devices',['adb','shell','am','start','-a','android.intent.action.VIEW','-d',url,'-p','com.android.chrome'],{timeout:15000});
 for(let n=0;n<20;n++){const list=await(await fetch(base+'/json/list')).json(); target=list.find(x=>x.url===url&&!old.has(x.id)); if(target)break; await new Promise(r=>setTimeout(r,300));}
 if(!target)throw Error('No exact new own target');report.target=target.id;
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.once('open',res);ws.once('error',rej)});
 let seq=0; const ask=(method,params={})=>new Promise((res,rej)=>{const id=++seq;const on=s=>{const j=JSON.parse(s);if(j.id===id){clearTimeout(timer);ws.off('message',on);j.error?rej(Error(j.error.message)):res(j.result)}};const timer=setTimeout(()=>{ws.off('message',on);rej(Error(method+' timeout'))},12000);ws.on('message',on);ws.send(JSON.stringify({id,method,params}));});
 await ask('Page.enable');await ask('Runtime.enable');await new Promise(r=>setTimeout(r,12000));
 report.ui=await ask('Runtime.evaluate',{expression:'JSON.stringify({url:location.href,visible:document.visibilityState,ready:document.readyState,engine:!!window.__engine,text:document.body.innerText.slice(0,1800),buttons:[...document.querySelectorAll("button")].map(x=>({text:x.innerText,aria:x.getAttribute("aria-label"),disabled:x.disabled})),scripts:[...document.scripts].map(x=>x.src),resources:performance.getEntriesByType("resource").map(x=>({name:new URL(x.name).pathname,status:x.responseStatus,duration:Math.round(x.duration)})),inputs:[...document.querySelectorAll("input")].map(x=>({type:x.type,placeholder:x.placeholder,name:x.name}))})',returnByValue:true});
} catch(e){report.error=String(e)} finally {
 if(ws)ws.close();if(target&&!old.has(target.id)){const r=await fetch(base+'/json/close/'+target.id);report.closed=r.ok;}
 await writeFile('temp/device-runs/samsung-fresh-ui-12s.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report));
}

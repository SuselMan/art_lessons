import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const base='http://127.0.0.1:9338', url='https://192.168.1.70:5314/?qa=ring-native-'+Date.now();
let target,ws,seq=0;const pending=new Map(),report={url,candidate:'a431c57e',cases:[]};
const save=()=>fs.writeFileSync('temp/KJc0OoVo/samsung-timeline-report.json',JSON.stringify(report,null,2));
const wall=setTimeout(()=>{save();if(target)fetch(base+'/json/close/'+target.id);ws?.close();process.exit(124)},180000);
function send(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
try{
 let previous=[];try{previous=await(await fetch(base+'/json/list')).json();}catch{} const before=new Set(previous.map(x=>x.id));
 execFileSync('/home/suselman/.local/bin/home-devices',['adb','shell','am','start','-a','android.intent.action.VIEW','-d',url,'--ez','create_new_tab','true','-p','com.android.chrome'],{timeout:15000});
 for(let i=0;i<40&&!target;i++){let pages=[];try{pages=await(await fetch(base+'/json/list')).json();}catch{} target=pages.find(x=>x.type==='page'&&!before.has(x.id)&&x.url.startsWith('https://192.168.1.70:5314/'));if(!target)await new Promise(r=>setTimeout(r,250));}
 if(!target)throw Error('Own new target absent');report.targetId=target.id;save();
 ws=new WebSocket(target.webSocketDebuggerUrl);ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.method==='Network.loadingFailed'){(report.networkFailures??=[]).push(r.params);save();}if(r.id){const p=pending.get(r.id);pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result);}};
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});await send('Page.bringToFront');await send('Network.enable');
 await send('Runtime.evaluate',{expression:'new Promise(resolve=>{if(document.readyState==="complete")resolve(true);else addEventListener("load",()=>resolve(true),{once:true})})',awaitPromise:true,returnByValue:true}); const resource=await send('Runtime.evaluate',{expression:'fetch(location.origin+"/src/engine/index.ts").then(async r=>({status:r.status,type:r.headers.get("content-type"),bytes:(await r.text()).length}))',awaitPromise:true,returnByValue:true});report.resource=resource;save();const fn=fs.readFileSync('temp/KJc0OoVo/timeline-bootstrap-function.js','utf8');const input=JSON.parse(fs.readFileSync('temp/KJc0OoVo/timeline-input.json'));const boot=await send('Runtime.evaluate',{expression:fn+'('+JSON.stringify({input})+')',awaitPromise:true,returnByValue:true});if(boot.exceptionDetails)throw Error(JSON.stringify(boot.exceptionDetails));report.boot=boot.result.value;save();
 async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
 async function shot(label){const state=await evaluate('({phase:window.__ringQA,settle:!!__timelineEngine._settle,queue:__timelineEngine._opQueue.length,reveals:__timelineEngine._washReveals.size,gl:__timelineEngine.gl.getError(),lost:__timelineEngine.gl.isContextLost()})');const image=await send('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:Math.min(512,report.boot.viewport.w),height:Math.min(512,report.boot.viewport.h),scale:1}});fs.writeFileSync('temp/KJc0OoVo/timeline-'+label+'.png',Buffer.from(image.data,'base64'));(report.shots??=[]).push({label,state});save();}
 await evaluate('window.__ringQA.phase="water";__timelineStroke("normal:100:0:PB29:round",80,[[100,150],[350,180],[100,230],[350,280],[100,330]],1200)');await shot('water');
 await evaluate('window.__ringQA.phase="pigment";__timelineStroke("normal:100:15:PB29:round",80,[[100,150],[350,180],[100,230],[350,280],[100,330]],1200)');
 for(const [label,delay]of [['lift',0],['250ms',250],['1s',750],['2s',1000],['5s',3000]]){if(delay)await new Promise(r=>setTimeout(r,delay));await shot(label);}
 report.final=await evaluate('({frames:__timelineStopFrames(),journal:structuredClone(__timelineEngine.getOperations()),gl:__timelineEngine.gl.getError(),lost:__timelineEngine.gl.isContextLost()})');await evaluate('__timelineEngine.destroy();true');save();

}catch(e){report.error=String(e);save();process.exitCode=1;}
finally{clearTimeout(wall);ws?.close();if(target){await fetch(base+'/json/close/'+target.id);report.ownTargetClosed=true;}save();console.log('OWNED_TARGET_CLOSED');}

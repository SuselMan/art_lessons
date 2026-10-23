import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const base='http://127.0.0.1:9338', url='https://192.168.1.70:5314/?qa=ring-native-'+Date.now();
let target,ws,seq=0;const pending=new Map(),report={url,candidate:'a431c57e',cases:[]};
const save=()=>fs.writeFileSync('temp/KJc0OoVo/samsung-native-report.json',JSON.stringify(report,null,2));
const wall=setTimeout(()=>{save();if(target)fetch(base+'/json/close/'+target.id);ws?.close();process.exit(124)},180000);
function send(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
try{
 const before=new Set((await(await fetch(base+'/json/list')).json()).map(x=>x.id));
 execFileSync('/home/suselman/.local/bin/home-devices',['adb','shell','am','start','-a','android.intent.action.VIEW','-d',url,'--ez','create_new_tab','true','-p','com.android.chrome'],{timeout:15000});
 for(let i=0;i<40&&!target;i++){target=(await(await fetch(base+'/json/list')).json()).find(x=>x.type==='page'&&!before.has(x.id)&&x.url.startsWith('https://192.168.1.70:5314/'));if(!target)await new Promise(r=>setTimeout(r,250));}
 if(!target)throw Error('Own new target absent');report.targetId=target.id;save();
 ws=new WebSocket(target.webSocketDebuggerUrl);ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id){const p=pending.get(r.id);pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result);}};
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});await send('Page.bringToFront');
 const fn=fs.readFileSync('temp/KJc0OoVo/native-function.js','utf8');
 for(const arm of ['baseline','candidate']){
  const r=await send('Runtime.evaluate',{expression:fn+'('+JSON.stringify({ops:[],arm,fixture:'native'})+')',awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails){report.exception=r.exceptionDetails;throw Error('Native expression failed');}
  const d=r.result.value;for(const k of ['png','redoPNG']){fs.writeFileSync('temp/KJc0OoVo/samsung-native-'+arm+'-'+k+'.png',Buffer.from(d[k],'base64'));delete d[k];}report.cases.push({arm,...d});save();console.log('DONE',arm);
 }
}catch(e){report.error=String(e);save();process.exitCode=1;}
finally{clearTimeout(wall);ws?.close();if(target){await fetch(base+'/json/close/'+target.id);report.ownTargetClosed=true;}save();console.log('OWNED_TARGET_CLOSED');}

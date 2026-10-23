import{createRequire}from'node:module';import fs from'node:fs';import{execFileSync}from'node:child_process';
const WebSocket=createRequire('/home/suselman/projects/pencil-agents/680-device-qa-guards/package.json')('ws');
const base='http://127.0.0.1:9338',nonce='costmask580_'+Date.now(),url='http://192.168.1.70:5325/cost-domain.html?qa='+nonce,OUT=process.env.WC_QA_OUT;
if(!OUT)throw Error('Explicit output required');fs.mkdirSync(OUT,{recursive:true});
const fn=fs.readFileSync(new URL('./cost-mask-adreno-function.js',import.meta.url),'utf8');new Function('return '+fn);
const manifest=JSON.parse(fs.readFileSync(new URL('./costmask-current-manifest.json',import.meta.url),'utf8'));
const report={url,nonce,manifest,errors:[],network:[],stages:[]};let target,ws,seq=0,progress;const pending=new Map();
const save=()=>fs.writeFileSync(OUT+'/report.json',JSON.stringify(report,null,2));
const send=(method,params={},timeout=15000)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},timeout);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))});
const evaluate=async(expression,timeout)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},timeout);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value};
const wall=setTimeout(()=>{report.timeout=true;save();if(target)void fetch(base+'/json/close/'+target.id)},180000);
try{
 report.serial=execFileSync('/home/suselman/.local/bin/home-devices',['adb','shell','getprop','ro.serialno'],{timeout:10000}).toString().trim();if(report.serial!=='R52RB0JXVSY')throw Error('Serial mismatch');
 const memory=execFileSync('/home/suselman/.local/bin/home-devices',['adb','shell','cat','/proc/meminfo'],{timeout:10000}).toString();report.deviceMemAvailableKiB=Number(memory.match(/^MemAvailable:\s+(\d+)/m)?.[1]);
 report.version=await(await fetch(base+'/json/version')).json();delete report.version.webSocketDebuggerUrl;
 const before=await(await fetch(base+'/json/list')).json(),known=new Set(before.map(t=>t.id));report.beforeIDs=[...known];
 execFileSync('/home/suselman/.local/bin/home-devices',['adb','shell','am','start','-a','android.intent.action.VIEW','-d',url,'-p','com.android.chrome','--ez','create_new_tab','true'],{timeout:15000});
 for(let i=0;i<40&&!target;i++){const list=await(await fetch(base+'/json/list')).json();target=list.find(t=>!known.has(t.id)&&t.url===url);if(!target)await new Promise(r=>setTimeout(r,250))}if(!target)throw Error('No exact new own target');report.target=target.id;
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
 ws.on('message',raw=>{const x=JSON.parse(raw);if(x.id){const p=pending.get(x.id);if(p){clearTimeout(p.timer);pending.delete(x.id);x.error?p.reject(Error(x.error.message)):p.resolve(x.result)}}else if(x.method==='Runtime.exceptionThrown')report.errors.push(x.params.exceptionDetails.text);else if(x.method==='Network.loadingFailed')report.network.push({type:x.params.type,error:x.params.errorText})});
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Page.bringToFront');
 report.boot=await evaluate('({url:location.href,ready:document.readyState,visibility:document.visibilityState})');if(report.boot.url!==url||report.boot.visibility!=='visible')throw Error('Own foreground guard');
 progress=setInterval(()=>{void evaluate('window.__costMaskPhase??null',5000).then(p=>{report.stages.push({at:new Date().toISOString(),...p});save()}).catch(()=>{})},5000);
 report.result=await evaluate('('+fn+')('+JSON.stringify({source:manifest.base,net:['39e1a488','580713e9'],nonce})+')',170000);save();
 if(report.result.error||report.result.gl||report.result.lost||report.result.cold?.length!==15||!report.result.completed)throw Error('Adreno primitive/compile guard');report.completed=true;
}catch(error){report.error=String(error);process.exitCode=1}finally{clearTimeout(wall);clearInterval(progress);ws?.close();if(target){await fetch(base+'/json/close/'+target.id);report.ownTargetClosed=true}save()}
console.log(JSON.stringify({completed:report.completed,error:report.error,target:report.target,closed:report.ownTargetClosed}));

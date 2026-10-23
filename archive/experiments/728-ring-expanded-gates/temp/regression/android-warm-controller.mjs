import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const require=createRequire('/home/suselman/projects/pencil/package.json');
const WebSocket=require('ws');
if(process.env.WC_GPU_SLOT!=='granted')throw Error('explicit device grant required');
const probe=readFileSync(new URL('./android-warm-probe.js',import.meta.url),'utf8');new Function('return '+probe);
const full=JSON.parse(readFileSync(new URL('./android-ops3.json',import.meta.url)));const input={revision:'current-warm340',policy:'DEFAULT',baked:true,moduleURL:'http://192.168.1.70:5335/bundles/current-warm340.mjs',ops:full.filter(o=>o.type!=='image_import'),operationTimeout:180000};
const base='http://127.0.0.1:9338',nonce='ring-clean-'+Date.now();
const out=process.env.WC_QA_OUT;if(!out)throw Error('explicit raw path');mkdirSync(out,{recursive:true});
const report={nonce,source:input.source,hashes:input.hashes};const save=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
let target,ws,id=0;const pending=new Map();
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
const wall=setTimeout(()=>{report.timeout=true;save();if(target)void fetch(base+'/json/close/'+target.id);},900000);
try{
 report.browser=(await (await fetch(base+'/json/version')).json()).Browser;
 const ownURL='http://192.168.1.70:5335/regression.html?qa='+nonce;
 execFileSync('/home/suselman/.local/bin/home-devices',['adb','shell','am','start','-a','android.intent.action.VIEW','-d',ownURL,'-p','com.android.chrome'],{timeout:15000});
 for(let n=0;n<40&&!target;n++){target=(await(await fetch(base+'/json/list')).json()).find(x=>x.url===ownURL);if(!target)await new Promise(r=>setTimeout(r,250));}
 if(!target)throw Error('exact own URL unavailable');report.target=target.id;save();
 await fetch(base+'/json/activate/'+target.id);
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
 ws.on('close',()=>{for(const p of pending.values())p.reject(Error('own CDP closed'));pending.clear();});
 ws.on('message',data=>{const x=JSON.parse(String(data));if(x.id){const p=pending.get(x.id);pending.delete(x.id);if(p)x.error?p.reject(x.error):p.resolve(x.result);}});
 const result=await send('Runtime.evaluate',{expression:'('+probe+')('+JSON.stringify(input)+')',returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);
 report.result=result.result.value;for(const k of ['preDryPNG','finalPNG','transparentPNG'])if(report.result[k]){writeFileSync(out+'/'+k+'.png',Buffer.from(report.result[k],'base64'));report.result[k]={file:k+'.png'};}report.completed=report.result.completed&&report.result.engineClosed&&report.result.bakedCalls>0&&!report.result.gpu.gl&&!report.result.gpu.lost;if(!report.completed)throw Error('compile/GL gate');save();
}catch(e){report.error=String(e);process.exitCode=1;save();}
finally{clearTimeout(wall);ws?.close();if(target){report.closeResponse=(await fetch(base+'/json/close/'+target.id)).status;report.ownedTargetClosed=!(await(await fetch(base+'/json/list')).json()).some(x=>x.id===target.id);}save();}
console.log(JSON.stringify({completed:report.completed,closed:report.ownedTargetClosed,error:report.error}));

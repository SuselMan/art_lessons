import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const require=createRequire('/home/suselman/projects/pencil/package.json');
const WebSocket=require('ws');
if(process.env.WC_GPU_SLOT!=='granted')throw Error('explicit device grant required');
const input=JSON.parse(readFileSync(new URL('./cold-input.json',import.meta.url)));
const base='http://127.0.0.1:9338',nonce='ring-clean-'+Date.now();
const out=process.env.WC_QA_OUT;if(!out)throw Error('explicit raw path');mkdirSync(out,{recursive:true});
const report={nonce,source:input.source,hashes:input.hashes};const save=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
let target,ws,id=0;const pending=new Map();
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
const wall=setTimeout(()=>{report.timeout=true;save();if(target)void fetch(base+'/json/close/'+target.id);},90000);
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
 const fn=function(input){
  const canvas=document.createElement('canvas');canvas.width=16;canvas.height=16;const gl=canvas.getContext('webgl');if(!gl)throw Error('WebGL unavailable');
  const debug=gl.getExtension('WEBGL_debug_renderer_info'),salt='ring-clean-'+Date.now(),rows=[];
  const compile=(kind,source)=>{const shader=gl.createShader(kind);gl.shaderSource(shader,'//'+salt+'\n'+source);gl.compileShader(shader);const ok=gl.getShaderParameter(shader,gl.COMPILE_STATUS),log=gl.getShaderInfoLog(shader);if(!ok){gl.deleteShader(shader);throw Error(log)}return shader;};
  try{for(const [name,source]of input.fragments){let v,f,p;try{v=compile(gl.VERTEX_SHADER,input.vertex);f=compile(gl.FRAGMENT_SHADER,source);p=gl.createProgram();gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);rows.push({name,linked:gl.getProgramParameter(p,gl.LINK_STATUS),log:gl.getProgramInfoLog(p),gl:gl.getError(),lost:gl.isContextLost()});}finally{if(p)gl.deleteProgram(p);if(v)gl.deleteShader(v);if(f)gl.deleteShader(f);}}
   return{salt,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),rows,gl:gl.getError(),lost:gl.isContextLost()};
  }finally{gl.getExtension('WEBGL_lose_context')?.loseContext();canvas.remove();}
 };
 const result=await send('Runtime.evaluate',{expression:'('+fn.toString()+')('+JSON.stringify(input)+')',returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);
 report.result=result.result.value;report.completed=report.result.rows.length===3&&report.result.rows.every(x=>x.linked&&!x.gl&&!x.lost)&&!report.result.gl&&!report.result.lost;if(!report.completed)throw Error('compile/GL gate');save();
}catch(e){report.error=String(e);process.exitCode=1;save();}
finally{clearTimeout(wall);ws?.close();if(target){report.closeResponse=(await fetch(base+'/json/close/'+target.id)).status;report.ownedTargetClosed=!(await(await fetch(base+'/json/list')).json()).some(x=>x.id===target.id);}save();}
console.log(JSON.stringify({completed:report.completed,closed:report.ownedTargetClosed,error:report.error}));

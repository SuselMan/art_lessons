import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const input=JSON.parse(fs.readFileSync('temp/KJc0OoVo/mobility-cold-input.json'));
const base='http://127.0.0.1:9338',url='https://192.168.1.70:5314/?qa=mobility-cold-'+Date.now();let target;const before=new Set((await fetch(base+'/json/list').then(r=>r.json()).catch(()=>[])).map(t=>t.id));execFileSync('/home/suselman/.local/bin/home-devices',['adb','shell','am','start','-a','android.intent.action.VIEW','-d',url,'--ez','create_new_tab','true','-p','com.android.chrome'],{timeout:15000});for(let n=0;n<40&&!target;n++){target=(await fetch(base+'/json/list').then(r=>r.json()).catch(()=>[])).find(t=>!before.has(t.id)&&t.url===url);if(!target)await new Promise(r=>setTimeout(r,250));}if(!target)throw Error('Own target absent');const ws=new WebSocket(target.webSocketDebuggerUrl);let seq=0;const pending=new Map();
const wall=setTimeout(()=>{ws.close();process.exit(124)},90000);
ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id){const p=pending.get(r.id);pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result);}};
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
function send(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
try{
 await send('Page.bringToFront');await send('Runtime.evaluate',{expression:'new Promise(r=>document.readyState==="complete"?r(true):addEventListener("load",()=>r(true),{once:true}))',awaitPromise:true,returnByValue:true});const expression='('+function(input){
  const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
  const gl=canvas.getContext('webgl');if(!gl)throw Error('No own WebGL context');
  const debug=gl.getExtension('WEBGL_debug_renderer_info');const results=[];
  const salt='ring-V-mobility-'+Date.now();
  function compile(type,source){const s=gl.createShader(type);gl.shaderSource(s,'//'+salt+'\n'+source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(log);}return s;}
  try{for(const [name,source]of input.fragments){const v=compile(gl.VERTEX_SHADER,input.vertex),f=compile(gl.FRAGMENT_SHADER,source),p=gl.createProgram();try{gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);results.push({name,linked:gl.getProgramParameter(p,gl.LINK_STATUS),log:gl.getProgramInfoLog(p),gl:gl.getError(),lost:gl.isContextLost()});}finally{gl.deleteProgram(p);gl.deleteShader(v);gl.deleteShader(f);}}
   return{candidate:input.candidate,hashes:input.hashes,salt,gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),results,gl:gl.getError(),lost:gl.isContextLost()};
  }finally{canvas.remove();}
 }.toString()+')('+JSON.stringify(input)+')';
 const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 fs.writeFileSync('temp/KJc0OoVo/mobility-cold-report.json',JSON.stringify(r,null,2));
 console.log(JSON.stringify(r.result?.value??{exception:r.exceptionDetails}));
}finally{clearTimeout(wall);ws.close();await fetch(base+'/json/close/'+target.id);console.log('OWNED_TARGET_CLOSED',target.id);}

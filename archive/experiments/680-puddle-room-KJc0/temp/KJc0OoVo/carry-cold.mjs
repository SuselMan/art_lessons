import fs from 'node:fs';
const input=JSON.parse(fs.readFileSync('temp/KJc0OoVo/carry-cold-input.json'));
if(!process.argv[2])throw Error('Own target websocket URL required');
const ws=new WebSocket(process.argv[2]);let seq=0;const pending=new Map();
const wall=setTimeout(()=>{ws.close();process.exit(124)},90000);
ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id){const p=pending.get(r.id);pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result);}};
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
function send(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
try{
 const expression='('+function(input){
  const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
  const gl=canvas.getContext('webgl');if(!gl)throw Error('No own WebGL context');
  const debug=gl.getExtension('WEBGL_debug_renderer_info');const results=[];
  const salt='ring-cap8-'+Date.now();
  function compile(type,source){const s=gl.createShader(type);gl.shaderSource(s,'//'+salt+'\n'+source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(log);}return s;}
  try{for(const [name,source]of input.fragments){const v=compile(gl.VERTEX_SHADER,input.vertex),f=compile(gl.FRAGMENT_SHADER,source),p=gl.createProgram();try{gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);results.push({name,linked:gl.getProgramParameter(p,gl.LINK_STATUS),log:gl.getProgramInfoLog(p),gl:gl.getError(),lost:gl.isContextLost()});}finally{gl.deleteProgram(p);gl.deleteShader(v);gl.deleteShader(f);}}
   return{candidate:input.candidate,hashes:input.hashes,salt,gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),results,gl:gl.getError(),lost:gl.isContextLost()};
  }finally{canvas.remove();}
 }.toString()+')('+JSON.stringify(input)+')';
 const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 fs.writeFileSync('temp/KJc0OoVo/carry-cold-report.json',JSON.stringify(r,null,2));
 console.log(JSON.stringify(r.result?.value??{exception:r.exceptionDetails}));
}finally{clearTimeout(wall);ws.close();}

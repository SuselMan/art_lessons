import fs from 'node:fs'
import WebSocket from 'ws'
import {createHash} from 'node:crypto'
const pairs=JSON.parse(fs.readFileSync('temp/device-runs/selected-20261005/current-shader-pairs.json','utf8'))
const sources=Object.fromEntries(pairs.flatMap(p=>p.names.map((n,i)=>[n,p.source[i]])))
const pages=await (await fetch('http://127.0.0.1:9231/json/list')).json()
for(const p of pages.filter(p=>p.url.startsWith('https://192.168.1.70:5289/create')))await fetch('http://127.0.0.1:9231/json/close/'+p.id)
const target=JSON.parse(fs.readFileSync('temp/device-runs/selected-20261005/direct-target.json','utf8'))
if(!target)throw Error('Own candidate page absent')
const sock=new WebSocket(target.webSocketDebuggerUrl)
await new Promise((ok,no)=>{sock.on('open',ok);sock.on('error',no)})
let seq=0;const pending=new Map()
sock.on('message',raw=>{const r=JSON.parse(raw);if(r.method==='Security.certificateError'){send('Security.handleCertificateError',{eventId:r.params.eventId,action:r.params.requestURL.startsWith('https://192.168.1.70:5289/')?'continue':'cancel'}).catch(()=>{});}if(r.id){const p=pending.get(r.id);if(p){clearTimeout(p.t);pending.delete(r.id);r.error?p.no(Error(r.error.message)):p.ok(r.result)}}})
function send(method,params){return new Promise((ok,no)=>{const id=++seq;const t=setTimeout(()=>{pending.delete(id);no(Error('CDP timeout '+method))},45000);pending.set(id,{ok,no,t});sock.send(JSON.stringify({id,method,params}))})}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+' '+r.exceptionDetails.exception?.description);return r.result.value}
const out={date:new Date().toISOString(),origin:'https://192.168.1.70:5289',targetId:target.id,programs:[]}
try{

 out.device=await ev(`(async()=>{const m=${JSON.stringify(sources)};const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const gl=canvas.getContext('webgl');if(!gl)throw Error('No WebGL');window.__selectedShaderQA={m,gl};const ext=gl.getExtension('WEBGL_debug_renderer_info');return {ua:navigator.userAgent,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),lost:gl.isContextLost()}})()`)
 for(const [v,f] of [['DAB_VERT','DAB_FRAG'],['DAB_VERT_INSTANCED','DAB_FRAG'],['RIBBON_VERT','RIBBON_FRAG'],...['WC_FIELD_OP_FRAG','WC_FIELD_OP_HIGH_FRAG','WC_FIELD_OP_CARRY_FRAG','WC_FIELD_OP_CARRY_COLOUR_FRAG','WC_DIFFUSE_FRAG','WC_BRUSH_DRAG_FRAG'].map(f=>['DISPLAY_VERT',f])]){
  const row=await ev(`(async()=>{const {m,gl}=window.__selectedShaderQA;const names=${JSON.stringify([v,f])};const salt='// selected '+Date.now()+' '+Math.random()+'\\n';const p=gl.createProgram(),sh=[];const hashes=[];let compiled=true,logs=[];const start=performance.now();for(let i=0;i<2;i++){const src=m[names[i]];if(typeof src!=='string')throw Error('Missing shader '+names[i]);const s=gl.createShader(i?gl.FRAGMENT_SHADER:gl.VERTEX_SHADER);gl.shaderSource(s,salt+src);gl.compileShader(s);compiled&&=gl.getShaderParameter(s,gl.COMPILE_STATUS);logs.push(gl.getShaderInfoLog(s));gl.attachShader(p,s);sh.push(s)}gl.linkProgram(p);const linked=gl.getProgramParameter(p,gl.LINK_STATUS),log=gl.getProgramInfoLog(p),lost=gl.isContextLost(),error=gl.getError();gl.deleteProgram(p);sh.forEach(s=>gl.deleteShader(s));return {names,hashes,compiled,linked,lost,error,logs,log,ms:performance.now()-start}})()`)
  row.hashes=[v,f].map(n=>createHash('sha256').update(sources[n]).digest('hex'));out.programs.push(row);fs.writeFileSync('temp/device-runs/selected-20261005/samsung-link.json',JSON.stringify(out,null,2));console.log(JSON.stringify({names:row.names,compiled:row.compiled,linked:row.linked,lost:row.lost,error:row.error,ms:row.ms}));if(!row.compiled||!row.linked||row.lost||row.error)throw Error('Real compile/link failed')
 }
 out.complete=true
}catch(e){out.error=String(e);process.exitCode=1}
finally{try{await ev(`(()=>{const q=window.__selectedShaderQA;q?.gl.getExtension('WEBGL_lose_context')?.loseContext();delete window.__selectedShaderQA;return true})()`)}catch{}fs.writeFileSync('temp/device-runs/selected-20261005/samsung-link.json',JSON.stringify(out,null,2));sock.close();await fetch('http://127.0.0.1:9231/json/close/'+target.id)}

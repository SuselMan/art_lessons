import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import WebSocket from 'ws';
const adb='/home/suselman/tools/platform-tools/adb',serial='192.168.1.36:45603';
const base='http://localhost:9222';
const initial=await(await fetch(base+'/json/list')).json();
const original=initial.find(t=>t.url.startsWith('https://grafetto.com/'));
const nonce=Date.now();const url='https://192.168.1.70:5277/create?qa-685='+nonce;
let tab,ws;
try {
 execFileSync(adb,['-s',serial,'shell','am','start','-a','android.intent.action.VIEW','-d',url,'-p','com.android.chrome'],{stdio:'ignore'});
 for(let i=0;i<20;i++){const tabs=await(await fetch(base+'/json/list')).json();tab=tabs.find(t=>t.url===url);if(tab)break;await new Promise(r=>setTimeout(r,500))}
 if(!tab)throw new Error('QA tab not found');
 ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
 let id=0;const pending=new Map();ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result)}}});
 const rpc=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;const timer=setTimeout(()=>{pending.delete(next);reject(new Error(method+' timeout'))},30000);pending.set(next,{resolve,reject,timer});ws.send(JSON.stringify({id:next,method,params}))});
 await new Promise(r=>setTimeout(r,2500));
 const code=`(async()=>{
 const m=await import('/src/engine/src/raster/shaders.ts?cold=${nonce}');
 const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const gl=canvas.getContext('webgl');if(!gl)return {error:'No WebGL'};
 const ext=gl.getExtension('WEBGL_debug_renderer_info');const gpu=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);const results=[];
 for(let round=0;round<3;round++)for(const name of ['WC_FIELD_OP_FRAG','WC_FIELD_OP_HIGH_FRAG','WC_FIELD_OP_CARRY_FRAG','WC_FIELD_OP_CARRY_COLOUR_FRAG']){
 const salt='// merged-cold-${nonce}-'+round+'-'+name+'\\n';const shaders=[];const t=performance.now();
 for(const [kind,source] of [[gl.VERTEX_SHADER,m.DISPLAY_VERT],[gl.FRAGMENT_SHADER,m[name]]]){const shader=gl.createShader(kind);gl.shaderSource(shader,salt+source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))return {gpu,results,error:gl.getShaderInfoLog(shader),lost:gl.isContextLost(),name};shaders.push(shader)}
 const program=gl.createProgram();for(const s of shaders)gl.attachShader(program,s);gl.linkProgram(program);const ok=gl.getProgramParameter(program,gl.LINK_STATUS);const lost=gl.isContextLost();results.push({round,name,ok,lost,ms:Math.round(performance.now()-t)});if(!ok||lost)return {gpu,results,error:gl.getProgramInfoLog(program),lost};gl.deleteProgram(program);for(const s of shaders)gl.deleteShader(s);
 }
 const lost=gl.isContextLost();gl.getExtension('WEBGL_lose_context')?.loseContext();return {gpu,results,lost};
 })()`;
 const r=await rpc('Runtime.evaluate',{expression:code,awaitPromise:true,returnByValue:true});
 if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));
 const report={serial,commit:'5e0d7df7',at:new Date().toISOString(),...r.result.value};writeFileSync('temp/device-runs/merge-685/cold-fields.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 if(report.error||report.lost||report.results?.some(x=>!x.ok||x.lost))process.exitCode=1;
} finally {
 if(ws)ws.close();
 if(tab)await fetch(base+'/json/close/'+tab.id).catch(()=>{});
 if(original)await fetch(base+'/json/activate/'+original.id).catch(()=>{});
}

import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import WebSocket from 'ws';
const adb='/home/suselman/tools/platform-tools/adb',serial=JSON.parse(readFileSync('/home/suselman/.local/share/codex-portal/android-endpoint.json','utf8')).endpoint;
const base='http://localhost:9224';
const initial=await(await fetch(base+'/json/list')).json();
const original=initial.find(t=>t.url.startsWith('https://grafetto.com/'));
const nonce=Date.now();const url='https://192.168.1.70:5277/create?qa-brush-drag='+nonce;
let tab,ws,restoreSecurity;
try {
 execFileSync(adb,['-s',serial,'shell','am','start','-a','android.intent.action.VIEW','-d',url,'-p','com.android.chrome'],{stdio:'ignore'});
 for(let i=0;i<20;i++){const tabs=await(await fetch(base+'/json/list')).json();tab=tabs.find(t=>t.url===url);if(tab)break;await new Promise(r=>setTimeout(r,500))}
 if(!tab)throw new Error('QA tab not found');
 ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
 let id=0;const pending=new Map();ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result)}}});
 const rpc=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;const timer=setTimeout(()=>{pending.delete(next);reject(new Error(method+' timeout'))},60000);pending.set(next,{resolve,reject,timer});ws.send(JSON.stringify({id:next,method,params}))});
 await new Promise(r=>setTimeout(r,2500));
 restoreSecurity=()=>rpc('Security.setIgnoreCertificateErrors',{ignore:false}); await rpc('Security.setIgnoreCertificateErrors',{ignore:true}); await rpc('Page.navigate',{url}); await new Promise(r=>setTimeout(r,3000));
 const boot=await rpc('Runtime.evaluate',{expression:`(async()=>{if(!window.__linkPairs){const m=await import('/src/dev/linkSpy.ts');const old=localStorage.getItem('__linkSpy');localStorage.setItem('__linkSpy','1');m.startLinkSpy();if(old===null)localStorage.removeItem('__linkSpy');else localStorage.setItem('__linkSpy',old)}const input=document.querySelector('input[type="text"]');if(!input)throw new Error('No creation form');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'qa-brush-drag-smoke');input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,200));document.querySelector('form').requestSubmit();return true})()`,awaitPromise:true,returnByValue:true});
 if(boot.exceptionDetails)throw new Error(JSON.stringify(boot.exceptionDetails));
 const code=`(async()=>{
 for(let i=0;i<100&&!window.__engine;i++)await new Promise(r=>setTimeout(r,200));
 const e=window.__engine;if(!e)return {error:'Engine did not start',page:location.pathname};
 const ext=e.gl.getExtension('WEBGL_debug_renderer_info');const gpu=ext?e.gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):e.gl.getParameter(e.gl.RENDERER);
 const passport={gpu,room:location.pathname,size:[e._opts.width,e._opts.height],paper:e._opts.paper,dpr:devicePixelRatio};
 if(e.gl.isContextLost())return {...passport,error:'Engine context lost on start',lost:true};
 const idle=async()=>{for(let i=0;i<600;i++){if(!e._settle&&!e._opQueue.length&&!e._rebuildJobs.size&&!e._pendingRebuilds.size)return;await new Promise(r=>setTimeout(r,50))}throw Error('Engine remained busy')};
 const raf=()=>new Promise(r=>requestAnimationFrame(r));
 for(const [row,nib]of [[0,'round'],[1,'chisel']]){
 e.setTool('watercolor');e.setPencil('normal:100:100:PB29:'+nib);e.setSize(nib==='round'?50:30);e.setColor([.165,.231,.592]);
 let t=performance.now();const d=(x)=>({x: nib==='round' ? 500+70*Math.cos((x-400)*0.03) : x,y:nib==='round' ? 350+70*Math.sin((x-400)*0.03) : 500+Math.abs(((x-400)/20)%4-2)*25,pressure:.8,tiltX:0,tiltY:0,speed:.6,pointerType:'pen',timeStamp:t});e._onStart(d(400));
 for(let i=1;i<=60;i++){t+=8;e._onMove(d(400+i*4));if(i%6===0){await raf();await raf()}}
 t+=8;e._onEnd(d(640));await new Promise(r=>setTimeout(r,1200));await idle();
 }
 const before=e.getOperations().filter(o=>o.type==='stroke').length;const undo=e.undo()?.type;await new Promise(r=>setTimeout(r,1500));await idle();const redo=e.redo()?.type;await new Promise(r=>setTimeout(r,2500));await idle();const after=e.getOperations().filter(o=>o.type==='stroke').length;
 if(e.gl.isContextLost())return {...passport,error:'Engine lost during smoke',lost:true,before,after,undo,redo};
 const pairs=(window.__linkPairs||[]).filter(pair=>pair.some(src=>src.includes('u_flowRect')||src.includes('v_pigmentPool'))).map(pair=>pair.slice());if(!pairs.length)return {...passport,error:'No program sources captured'};
 const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const gl=canvas.getContext('webgl');if(!gl)return {...passport,error:'No diagnostic GL',lost:true};const results=[];
 for(let i=0;i<pairs.length;i++){
 const salt='// sheet6-cold-${nonce}-'+i+String.fromCharCode(10);const shaders=[];const t0=performance.now();
 for(const [index,src]of pairs[i].entries()){const shader=gl.createShader(index===0?gl.VERTEX_SHADER:gl.FRAGMENT_SHADER);gl.shaderSource(shader,salt+src);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))return {...passport,results,error:gl.getShaderInfoLog(shader),lost:gl.isContextLost(),program:i};shaders.push(shader)}
 const program=gl.createProgram();for(const sh of shaders)gl.attachShader(program,sh);gl.linkProgram(program);const ok=gl.getProgramParameter(program,gl.LINK_STATUS),lost=gl.isContextLost();results.push({i,ok,lost,ms:Math.round(performance.now()-t0),lengths:pairs[i].map(s=>s.length)});if(!ok||lost)return {...passport,results,error:gl.getProgramInfoLog(program),lost};gl.deleteProgram(program);for(const sh of shaders)gl.deleteShader(sh);
 }
 const blob=await e.exportPNG(false);const bytes=new Uint8Array(await blob.arrayBuffer());let png='';for(let i=0;i<bytes.length;i+=8192)png+=String.fromCharCode(...bytes.subarray(i,i+8192));const lost=e.gl.isContextLost()||gl.isContextLost();gl.getExtension('WEBGL_lose_context')?.loseContext();return {...passport,results,lost,before,after,undo,redo,png:btoa(png),operations:e.getOperations()};
 })()`;
 const r=await rpc('Runtime.evaluate',{expression:code,awaitPromise:true,returnByValue:true});
 if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));
 const {png,operations,...value}=r.result.value;if(png)writeFileSync('temp/wc-runs/brush-drag/sheet6-device.png',Buffer.from(png,'base64'));if(operations)writeFileSync('temp/wc-runs/brush-drag/sheet6-device-ops.json',JSON.stringify(operations));const report={serial,commit:'sheet6-working',at:new Date().toISOString(),...value};writeFileSync('temp/wc-runs/brush-drag/sheet6-device-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 if(report.error||report.lost||report.before!==2||report.after!==2||report.undo!=='stroke'||report.redo!=='stroke'||report.results?.some(x=>!x.ok||x.lost))process.exitCode=1;
} finally {
 if(restoreSecurity)await restoreSecurity().catch(()=>{});
 if(ws)ws.close();
 if(tab)await fetch(base+'/json/close/'+tab.id).catch(()=>{});
 if(original)await fetch(base+'/json/activate/'+original.id).catch(()=>{});
}

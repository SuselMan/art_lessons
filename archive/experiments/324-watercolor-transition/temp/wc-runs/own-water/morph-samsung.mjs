import WebSocket from 'ws';import fs from 'node:fs';
const base='http://127.0.0.1:9233';
const pages=await(await fetch(base+'/json/list')).json();
const target=pages.find(p=>p.url.includes(':5313/morph-review.html'));
if(!target)throw Error('Own morph QA page missing');
fs.writeFileSync('temp/wc-runs/own-water/morph-qa-tab.json',JSON.stringify({id:target.id,url:target.url}));
const s=new WebSocket(target.webSocketDebuggerUrl);await new Promise((ok,no)=>{s.once('open',ok);s.once('error',no)});
let seq=0;const pending=new Map();
s.on('message',data=>{const r=JSON.parse(data);if(r.id&&pending.has(r.id)){const p=pending.get(r.id);clearTimeout(p.timer);pending.delete(r.id);r.error?p.no(Error(r.error.message)):p.ok(r.result)}});
const send=(method,params={})=>new Promise((ok,no)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);no(Error('Timeout '+method))},180000);pending.set(id,{ok,no,timer});s.send(JSON.stringify({id,method,params}))});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
const rows=[];
try{
 await send('Page.bringToFront');
 await ev(`(async()=>{for(let i=0;i<100&&!window.review?.ready;i++)await new Promise(r=>setTimeout(r,100));if(!window.review?.ready)throw Error('Review not ready');const p=WebGLRenderingContext.prototype,source=p.shaderSource,link=p.linkProgram;window.__cold={linked:0,failed:0};p.shaderSource=function(shader,text){return source.call(this,shader,'// morph-cold-'+Date.now()+'\\n'+text)};p.linkProgram=function(program){link.call(this,program);__cold.linked++;if(!this.getProgramParameter(program,this.LINK_STATUS))__cold.failed++};return true})()`);
 for(const kind of ['line','puddle']){
  const r=await ev(`(async()=>{
   await review.run(${JSON.stringify(kind)});const e=review.engine,gl=e.gl;
   const early={age:performance.now()-review.penUp,masks:[...e._washReveals.values()].filter(r=>r.wetMask).length};
   await review.sleep(1000);
   const advance=e._advanceWashReveal,gain=e._revealMotionGain;e._advanceWashReveal=()=>{};e._revealMotionGain=()=>0;e._display();const a=new Uint8Array(800*600*4);gl.readPixels(0,0,800,600,gl.RGBA,gl.UNSIGNED_BYTE,a);e._revealMotionGain=gain;e._display();const b=new Uint8Array(a.length);gl.readPixels(0,0,800,600,gl.RGBA,gl.UNSIGNED_BYTE,b);e._advanceWashReveal=advance;let changed=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d)changed++;max=Math.max(max,d)}
   const motionGL=gl.getError();await review.idle();const t=performance.now();e.watercolorDryAll();await review.idle(true);const acceleratedMs=performance.now()-t;
   const first=new Uint8Array(await(await e.exportPNG(false)).arrayBuffer());for(const id of new Set(e.getOperations().map(o=>o.layerId)))e._rebuildLayer(id);await review.idle();e.watercolorDryAll();await review.idle(true);const bytes=new Uint8Array(await(await e.exportPNG(false)).arrayBuffer());let png='';for(let i=0;i<bytes.length;i+=8192)png+=String.fromCharCode(...bytes.subarray(i,i+8192));
   return{early,motion:{changed,max,gl:motionGL},acceleratedMs,same:first.length===bytes.length&&first.every((v,i)=>v===bytes[i]),gl:gl.getError(),lost:gl.isContextLost(),cold:{...__cold},png:btoa(png)}
  })()`);
  fs.writeFileSync('temp/wc-runs/own-water/morph-'+kind+'-samsung.png',Buffer.from(r.png,'base64'));delete r.png;rows.push({kind,...r});fs.writeFileSync('temp/wc-runs/own-water/morph-samsung.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows.at(-1)));
 }
}finally{s.close()}

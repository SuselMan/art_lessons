const {chromium}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const mode=process.argv[2]||'material',out=process.argv[3];if(!out)throw Error('output required');
 const b=process.env.MINI_CDP?await chromium.connectOverCDP(process.env.MINI_CDP):await chromium.launch({channel:'chrome',headless:false});
 const context=process.env.MINI_CDP?b.contexts()[0]:await b.newContext();const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const result={mode,started:new Date().toISOString(),errors,states:[]};
 try{
 await p.goto((process.env.MINI_BASE||'http://localhost:15385')+'/watercolor-mini?mode='+mode,{waitUntil:'networkidle',timeout:60000});
 await p.waitForFunction(()=>window.__miniPuddle,{timeout:30000});await p.evaluate(()=>__wcNative.paperReady());
 result.gpu=await p.evaluate(()=>{const gl=__wcNative.gl,x=gl.getExtension('WEBGL_debug_renderer_info');return x?gl.getParameter(x.UNMASKED_RENDERER_WEBGL):'unknown'});
 async function state(label){const s=await p.evaluate(()=>({controller:__miniPuddle.state,gl:__wcNative.gl.getError(),lost:__wcNative.gl.isContextLost(),ops:__wcNative.getOperations().filter(o=>o.type==='stroke').length,status:document.querySelector('#error').textContent}));result.states.push({label,...s});fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify(result,null,2));return s}
 async function stroke(points,color,size=180){const r=await p.evaluate(({color,size})=>{document.querySelector('#color').value=color;document.querySelector('#color').dispatchEvent(new Event('input'));document.querySelector('#size').value=size;document.querySelector('#size').dispatchEvent(new Event('input'));const r=document.querySelector('#paper').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}},{color,size});await p.mouse.move(r.x+r.w*points[0][0],r.y+r.h*points[0][1]);await p.mouse.down();for(const pt of points.slice(1)){await p.mouse.move(r.x+r.w*pt[0],r.y+r.h*pt[1]);await p.waitForTimeout(16)}await p.mouse.up();}
 const line=(a,z)=>Array.from({length:16},(_,i)=>[a[0]+(z[0]-a[0])*i/15,a[1]+(z[1]-a[1])*i/15]);
 await state('ready');await stroke(line([.25,.3],[.75,.65]),'#165ac9');await state('first-up');
 await stroke(line([.25,.65],[.75,.3]),'#efd227');await state('second-up');await p.waitForTimeout(150);
 await stroke(line([.32,.45],[.65,.5]),'#cb2453',240);await state('third-cancels');
 await p.screenshot({path:path.join(out,mode+'-wet.png')});const t=Date.now();await p.click('#dry');
 await p.waitForFunction(()=>window.__miniPuddle.state.done&&!window.__miniPuddle.state.dry,{timeout:30000});result.dryMs=Date.now()-t;await state('dry');result.material=await p.evaluate(()=>{const s=__wcNative._wash?.scratch,e=s?[...s.tileEntries()][0]?.[1]:null;if(!e)return null;const a=e.coverage.readPixels();let water=0,silhouette=0;for(let i=0;i<a.length;i+=4){water+=a[i+2];silhouette+=a[i+3]}return {water,silhouette}});if(!result.material||result.material.water!==0||!result.material.silhouette)throw Error('Dry did not clear water or erased geometry');
 await p.screenshot({path:path.join(out,mode+'-dry.png')});await p.click('#clear');await p.waitForFunction(()=>window.__miniPuddle);await state('clear');
 if(errors.length||result.states.some(s=>s.gl||s.lost))throw Error('GL/browser errors');
 result.finished=new Date().toISOString();fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await p.close();await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const out='temp/wc-runs/foreign-water-live';mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:false,args:['--ignore-certificate-errors']});
try {
const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:1600,height:1000}});const errors=[];p.on('dialog',d=>d.accept());p.on('pageerror',e=>errors.push(e.message));
await p.goto('https://localhost:5277/create');await p.waitForTimeout(2500);
await p.locator('input[type="text"]').first().fill('pen-end-qa');await p.getByRole('button',{name:/Fine/}).first().click();
await p.getByText('A4',{exact:true}).first().click();await p.getByText('A4',{exact:true}).first().click();
await p.getByRole('button',{name:/Create project|Создать проект/}).click();await p.waitForURL(/\/room\/[^/]+$/);
await p.waitForFunction(()=>!!window.__engine,undefined,{timeout:60000});await p.waitForTimeout(2500);
const zoom=p.getByRole('button',{name:/^\d+%$/});if(await zoom.textContent()!=='100%')await zoom.click();
const live = await p.evaluate(async () => {
 const e=window.__engine, pause=ms=>new Promise(r=>setTimeout(r,ms)), raf=()=>new Promise(r=>requestAnimationFrame(r));
 const draw=async(points,pigment,size)=>{
  e.setTool('watercolor');e.setPencil('normal:100:'+pigment+':PB29:round');e.setSize(size);e.setColor([.165,.231,.592]);
  let t=performance.now();const data=p=>({x:p[0],y:p[1],pressure:.8,tiltX:0,tiltY:0,speed:.6,pointerType:'pen',timeStamp:t});
  e._onStart(data(points[0]));for(let i=1;i<points.length;i++){t+=8;e._onMove(data(points[i]));if(i%4===0){await raf();await raf()}}
  t+=8;e._onEnd(data(points.at(-1)));await pause(3000);
 };
 await draw(Array.from({length:51},(_,i)=>[600,430+i*6]),0,180);
 await draw(Array.from({length:81},(_,i)=>[360+i*6,580]),100,60);
 const ops=e.getOperations().filter(o=>o.type==='stroke');
 return {washIds:ops.map(o=>o.washId),wet:ops.map(o=>o.wet),sources:e._wash?.scratch.foreignSources?.length,contacts:e._wash?.scratch.wetContacts.length};
});
console.log('live',JSON.stringify(live));
if(new Set(live.washIds).size<2||!live.wet.some(w=>w&&/[4-9a-f]/.test(w))||!live.sources)throw new Error('Foreign puddle scenario was not reached');
await p.waitForTimeout(2000);await p.screenshot({path:out+'/live.png'});
await p.evaluate(()=>window.__engine.watercolorDryAll());await p.waitForTimeout(10000);
const exportPng=()=>p.evaluate(async()=>{const e=window.__engine;const blob=await e.exportPNG(false);const bytes=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)});
const save=async(name)=>{const bytes=Buffer.from(await exportPng(),'base64');writeFileSync(out+'/'+name+'.png',bytes);return createHash('sha256').update(bytes).digest('hex')};
const initial=await save('dry');
const undo=await p.evaluate(()=>window.__engine.undo()?.type);await p.waitForTimeout(1200);await save('undo');
const redo=await p.evaluate(()=>window.__engine.redo()?.type);await p.waitForTimeout(10000);const rebuilt=await save('redo');
const ops=await p.evaluate(()=>window.__engine.getOperations());writeFileSync(out+'/ops.json',JSON.stringify(ops));
const lost=await p.evaluate(()=>window.__engine.gl.isContextLost());
await p.reload();await p.waitForTimeout(2500);const join=p.getByRole('button',{name:/^Join|^Войти|^Присоединиться/});if(await join.count())await join.first().click();await p.screenshot({path:out+'/reload-start.png'});await p.waitForFunction(()=>!!window.__engine,undefined,{timeout:60000});await p.waitForTimeout(12000);
const restored=await save('restored');const loaded=await p.evaluate(()=>window.__engine.getOperations().length);
const report={live,initial,rebuilt,restored,undo,redo,operations:ops.length,loaded,errors,lost};writeFileSync(out+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {await b.close()}

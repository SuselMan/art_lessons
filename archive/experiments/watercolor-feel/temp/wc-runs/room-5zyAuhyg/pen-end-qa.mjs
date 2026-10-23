import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const out='temp/wc-runs/room-5zyAuhyg/pen-end-qa';mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:false,args:['--ignore-certificate-errors']});
try {
const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:1600,height:1000}});const errors=[];p.on('dialog',d=>d.accept());p.on('pageerror',e=>errors.push(e.message));
await p.goto('https://localhost:5277/create');await p.waitForTimeout(2500);
await p.locator('input[type="text"]').first().fill('pen-end-qa');await p.getByRole('button',{name:/Fine/}).first().click();
await p.getByText('A4',{exact:true}).first().click();await p.getByText('A4',{exact:true}).first().click();
await p.getByRole('button',{name:/Create project|Создать проект/}).click();await p.waitForURL(/\/room\/[^/]+$/);
await p.waitForFunction(()=>!!window.__engine,undefined,{timeout:60000});await p.waitForTimeout(2500);
const zoom=p.getByRole('button',{name:/^\d+%$/});if(await zoom.textContent()!=='100%')await zoom.click();
const box=await p.locator('canvas').first().boundingBox();const cdp=await p.context().newCDPSession(p);
for(const [row,nib,taper] of [[0,'round',false],[1,'round',true],[2,'chisel',false],[3,'chisel',true]]) {
await p.evaluate(({nib})=>{const e=window.__engine;e.setTool('watercolor');e.setPencil('normal:100:100:PB29:'+nib);e.setSize(nib==='round'?90:45);e.setColor([.165,.231,.592])},{nib});
const ev=(type,i,force)=>cdp.send('Input.dispatchMouseEvent',{type,x:box.x+220+8*i,y:box.y+200+row*140,button:'left',buttons:type==='mouseReleased'?0:1,pointerType:'pen',force,clickCount:type==='mouseMoved'?0:1});
await ev('mousePressed',0,.8);
for(let i=1;i<=85;i++){await ev('mouseMoved',i,taper&&i>60?.8-(i-60)*.028:.8);await p.waitForTimeout(8)}
await ev('mouseReleased',85,0);await p.waitForTimeout(1200);
}
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
const report={initial,rebuilt,restored,undo,redo,operations:ops.length,loaded,errors,lost};writeFileSync(out+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {await b.close()}

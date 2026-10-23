import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
const root='temp/wc-runs/room-5zyAuhyg';
const b=await chromium.launch({channel:'chrome',headless:false,args:['--ignore-certificate-errors']});
try {
 const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:1600,height:1000}});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('https://localhost:5277/room/5zyAuhyg');
 await p.waitForTimeout(2500);
 const join=p.getByRole('button',{name:/^Join|^Войти|^Присоединиться/}).first();if(await join.isVisible())await join.click();
 await p.waitForFunction(()=>!!window.__engine,{timeout:60000});await p.waitForTimeout(15000);
 await p.screenshot({path:root+'/original.png'});
 console.log(await p.evaluate(()=>({size:[window.__engine._opts.width,window.__engine._opts.height],active:window.__engine._activeId,viewport:window.__engine._viewport,lost:window.__engine.gl.isContextLost(),perf:window.__engine.getWatercolorPerf()})),errors);
} finally {await b.close()}

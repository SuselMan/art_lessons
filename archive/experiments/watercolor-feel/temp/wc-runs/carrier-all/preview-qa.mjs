import {chromium} from 'playwright';import {readFileSync,writeFileSync} from 'node:fs';
const base=readFileSync('/home/suselman/.local/share/stroke-gallery/url','utf8').trim();const b=await chromium.launch({headless:true});
try{
 const p=await b.newPage({viewport:{width:1500,height:1000}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'preview/carrier-all/');
 const counts=await p.evaluate(()=>({total:allData.length,rendered:allData.filter(s=>s.status==='rendered').length,sheets:[...new Set(allData.map(s=>s.sheet))]}));
 let loaded=0;const values=await p.locator('#stroke option').evaluateAll(os=>os.map(o=>o.value));
 for(const v of values){await p.locator('#stroke').selectOption(v);for(const mode of ['after','wet','motion']){await p.locator('#view').selectOption(mode);await p.waitForFunction(()=>[...document.querySelectorAll('.panes img')].every(i=>i.complete&&i.naturalWidth>0));loaded++;}}
 await p.locator('#sheet').selectOption('6');if(await p.locator('#stroke option').count()!==10)throw Error('sheet6 count');await p.locator('#view').selectOption('after');await p.locator('#stroke').selectOption('6:1');await p.locator('#next').focus();await p.keyboard.press('ArrowRight');if(await p.locator('#stroke').inputValue()!=='6:2')throw Error('arrows');await p.keyboard.press('ArrowLeft');
 await p.locator('#comment').fill('Temporary draft QA');await p.locator('#next').click();await p.locator('#prev').click();if(await p.locator('#comment').inputValue()!=='Temporary draft QA')throw Error('draft navigation');
 await p.locator('#sheet').selectOption('7');if(await p.locator('#comment').inputValue()!=='')throw Error('draft leaks across sheets');await p.screenshot({path:'temp/wc-runs/carrier-all/sheet7-desktop.png'});
 await p.locator('#sheet').selectOption('6');if(await p.locator('#comment').inputValue()!=='Temporary draft QA')throw Error('draft sheet roundtrip');
 let posted;await p.route('**/comments',async route=>{if(route.request().method()==='POST'){posted=route.request().postDataJSON();await route.fulfill({status:200,contentType:'application/json',body:'{}'});}else await route.continue();});await p.locator('#save').click();await p.waitForFunction(()=>document.querySelector('#status').textContent==='Сохранено');if(posted.sheet!=='6'||posted.n!==1||!posted.version.startsWith('cpu-all-'))throw Error('wrong comment identity');
 await p.screenshot({path:'temp/wc-runs/carrier-all/sheet6-desktop.png'});await p.locator('#sheet').selectOption('4');await p.screenshot({path:'temp/wc-runs/carrier-all/sheet4-desktop.png'});
 await p.locator('#sheet').selectOption('12');if(!(await p.locator('#missing').textContent()).includes('Нет записи'))throw Error('missing input label');
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:'temp/wc-runs/carrier-all/mobile.png'});const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow||errors.length)throw Error('layout/errors');
 const report={...counts,loaded,arrows:true,draftAcrossSheets:true,commentPayloadMocked:true,liveCommentsNotModified:true,missingInputLabel:true,overflow,errors};writeFileSync('temp/wc-runs/carrier-all/preview-qa.json',JSON.stringify(report,null,2));console.log(report);
}finally{await b.close()}

import {chromium} from 'playwright';import {readFileSync,writeFileSync} from 'node:fs';
const base=readFileSync('/home/suselman/.local/share/stroke-gallery/url','utf8').trim();const batchId=process.argv[2];const b=await chromium.launch({headless:true});
try{
 const p=await b.newPage({viewport:{width:1280,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'review/?batch=round1');await p.waitForFunction(()=>document.querySelector('#better').disabled===false);await p.screenshot({path:'temp/wc-runs/search-round1/review-desktop.png'});
 const snap=await(await p.request.get(base+'review/batches')).json();const batch=snap.batches.find(b=>b.id==='round1');if(batch.cases.length!==12)throw Error('case count');
 let images=0;for(const c of batch.cases)for(const key of ['baseline','candidate','reference']){const r=await p.request.get(base+c[key]);if(!r.ok())throw Error('image unavailable');images++;}
 await p.locator('#batches').selectOption(batchId);await p.waitForFunction(()=>document.querySelector('#uncertain').disabled===false);await p.locator('#comment').fill('Codex temporary QA');await p.locator('#uncertain').click();await p.waitForFunction(()=>document.querySelector('#progress').textContent.includes('Пачка оценена'));
 await p.reload();await p.waitForFunction(()=>document.querySelector('#progress').textContent.includes('Пачка оценена'));
 const votes=(await(await p.request.get(base+'review/batches')).json()).votes;const vote=votes.find(v=>v.batch===batchId);if(vote?.verdict!=='uncertain'||vote.comment!=='Codex temporary QA')throw Error('persistence');
 await p.locator('#batches').selectOption('round1');await p.waitForFunction(()=>document.querySelector('#better').disabled===false);await p.setViewportSize({width:390,height:844});await p.screenshot({path:'temp/wc-runs/search-round1/review-mobile.png'});if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)||errors.length)throw Error('layout/errors');
 const report={cases:12,images,uncertainSaved:true,commentSaved:true,reloadPersisted:true,errors};writeFileSync('temp/wc-runs/search-round1/review-qa.json',JSON.stringify(report,null,2));console.log(report);
}finally{await b.close()}

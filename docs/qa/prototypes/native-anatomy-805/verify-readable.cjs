'use strict';
const {chromium}=require('/home/suselman/projects/pencil-agents/805-watercolor-search/node_modules/@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
async function verify(target,out){
 const url=/^[a-z]+:/i.test(target)?target:pathToFileURL(target).href;
 fs.mkdirSync(out,{recursive:true});
 const proof={scope:'Headless Chromium: reading flow, responsive layout and image interactions; no GPU performance claim.',cases:[]};
 const browser=await chromium.launch({args:['--disable-gpu']});
 try{
  for(const width of [320,390,1440]){
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(url);assert.equal(await page.locator('#error').isVisible(),false);
    assert.equal(await page.locator('#scene').inputValue(),'mini-two-colors');
    assert.equal(await page.locator('#technical-details').evaluate(e=>e.open),false);
    await page.screenshot({path:path.join(out,'readable-'+width+'.png'),fullPage:true});
    let pictures=0;
    for(const scene of ['mini-two-colors','mini-wave']){
     await page.locator('#scene').selectOption(scene);
     assert.equal(await page.locator('#simple-chain .simple-step').count(),7);
     const gpu=await page.evaluate(()=>JSON.parse(document.getElementById('anatomy-data').textContent).gpuTiming?.scenes.find(s=>s.id===document.getElementById('scene').value));
     if(gpu){assert.equal(await page.locator('#gpu-timing-panel').isVisible(),true);assert.equal(await page.locator('.gpu-row').count(),8);const shown=await page.locator('.gpu-row').evaluateAll(rows=>rows.map(r=>Number(r.dataset.gpuMs)));assert.ok(Math.abs(shown.reduce((a,b)=>a+b,0)-gpu.representative.totalGpuMs)<.000001);assert.equal(await page.locator('#samsung-timing-body').isVisible(),false)}
     else assert.match(await page.locator('#time-explanation').innerText(),/каждый эффект отдельно, пока неизвестно/);
     assert.match(await page.locator('#plain-overview').innerText(),scene==='mini-wave'?/после отбора не осталось/:/действительно переносится/);
     for(const step of await page.locator('#simple-chain .simple-step').all()){
      assert.match(await step.innerText(),/Получаем/);assert.match(await step.innerText(),/Почему требует работы/);
      const detail=step.locator(':scope > details');assert.equal(await detail.count(),1);
      await detail.locator(':scope > summary').click();
      await step.locator('img').evaluate(async img=>{await img.decode();if(!img.naturalWidth)throw Error('Broken image')});pictures++;
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      await detail.locator(':scope > summary').click();
     }
     const surface=page.locator('#final .compare');await surface.scrollIntoViewIfNeeded();
     const box=await surface.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
     await page.waitForFunction(()=>document.querySelector('#final .compare').classList.contains('held'));
     await page.mouse.up();assert.equal(await surface.evaluate(e=>e.classList.contains('held')),false);
     assert.equal(await surface.evaluate(e=>!e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))),true);
     assert.equal(await surface.evaluate(e=>getComputedStyle(e).userSelect),'none');
    }
    assert.deepEqual(errors,[]);proof.cases.push({width,scenes:2,steps:14,pictures,holdRestores:2,errors,overflow:false});
   }finally{await page.close()}
  }
  proof.pass=true;
 }catch(error){proof.pass=false;proof.failure=error.stack;throw error}
 finally{await browser.close();proof.browserClosed=true;fs.writeFileSync(path.join(out,'readable-report.json'),JSON.stringify(proof,null,2)+'\n')}
 return proof;
}
if(require.main===module)verify(process.argv[2],process.argv[3]).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1});
module.exports={verify};

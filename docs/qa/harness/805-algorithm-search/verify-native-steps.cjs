'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {chromium}=require('/home/suselman/projects/pencil-agents/805-watercolor-search/node_modules/@playwright/test');

async function verify(target,output){
 assert.ok(target,'Missing page URL or HTML path');assert.ok(output,'Missing evidence directory');
 const directory=path.resolve(output);fs.mkdirSync(directory,{recursive:true});
 assert.ok(!fs.existsSync(path.join(directory,'report.json')),'Refusing to replace an existing report');
 const report={qualification:'Headless VPS Chromium, GPU disabled: static layout, DOM and images only. No watercolor computation or device performance claim.',cases:[],contextsClosed:false,browserClosed:false};
 const url=/^[a-z]+:/i.test(target)?target:pathToFileURL(path.resolve(target)).href;
 let browser,context;
 const persist=()=>fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
 try{
  browser=await chromium.launch({args:['--disable-gpu']});
  for(const width of [320,390,1440]){
   context=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce'});
   const page=await context.newPage(),errors=[],badResponses=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
   page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))badResponses.push({status:r.status(),resource:path.basename(new URL(r.url()).pathname)})});
   // The standalone diagnostic page has no favicon. Do not let browser's
   // implicit /favicon.ico request obscure errors from the actual document.
   await context.route('**/favicon.ico',route=>route.fulfill({status:204,body:''}));
   const caseReport={width,scenes:[],screenshots:[]};
   try{
    await page.goto(url,{waitUntil:'load'});await page.locator('#scene').waitFor({state:'visible'});
    assert.equal(await page.locator('.error').count(),0,'Page initialization error');
    const data=await page.locator('#data').evaluate(e=>JSON.parse(e.textContent));assert.ok(data.scenes?.length,'Empty dataset');
    const defaultId=data.scenes.some(s=>s.id==='mini-two-colors')?'mini-two-colors':data.scenes[0].id;
    assert.equal(await page.locator('#scene').inputValue(),defaultId,'Default scene changed');
    await noOverflow(page,width,'initial');
    const screenshot='steps-'+width+'.png';await page.screenshot({path:path.join(directory,screenshot),fullPage:false});caseReport.screenshots.push(screenshot);
    for(const scene of data.scenes){
     await page.locator('#scene').selectOption(scene.id);assert.equal(await page.locator('.error').count(),0);
     const gpu=page.locator('#native-pipeline [data-lane="gpu"]'),cpu=page.locator('#pipeline [data-lane="cpu"]');assert.equal(await gpu.count(),8,'Expected eight measured GPU groups');assert.ok(await cpu.count()>0);
     const representative=data.pipelineTiming?.scenes?.find(s=>s.id===scene.id)?.representative;
     if(representative?.completePipeline===true){assert.equal(await cpu.count(),representative.tasks.length,'Every CPU subtask must remain accessible in the page');for(const t of representative.tasks){const summary=page.locator('[id='+JSON.stringify('cpu-'+t.id)+'] > summary');assert.equal(await summary.count(),1,'Missing CPU task '+t.id)}}
     assert.equal(await page.locator('#pipeline details[open]').count(),0,'Selection must reset task expansions');
     const values=await gpu.evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.elapsedMs)));assert.ok(values.every(n=>Number.isFinite(n)&&n>0));
     await noOverflow(page,width,scene.id+' collapsed');
     // Open all explanations so deeply nested CPU rows and every GPU image
     // are checked. This is UI work only, not a new measurement.
     await page.locator('#pipeline details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));
     const images=page.locator('#pipeline img');for(const img of await images.all())await img.evaluate(async e=>{await e.decode();if(!e.naturalWidth||!e.naturalHeight)throw Error('Image failed to decode')});
     let holds=0,cancelRestores=0;
     for(const button of await page.locator('.image-compare').all()){
      await button.scrollIntoViewIfNeeded();await button.evaluate(e=>{if(e.disabled)throw Error('Comparison not ready')});const box=await button.boundingBox();assert.ok(box&&box.width>10&&box.height>10);
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
      assert.ok(await button.evaluate(e=>e.classList.contains('holding')),'Pointer hold did not show original');assert.equal(await button.locator('.before').evaluate(e=>getComputedStyle(e).opacity),'1');
      const prevented=await button.evaluate(e=>{const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});e.dispatchEvent(event);return event.defaultPrevented});assert.equal(prevented,true,'Context menu not prevented');
      assert.equal(await button.evaluate(e=>getComputedStyle(e).userSelect),'none','Image comparison is selectable');
      await page.mouse.up();assert.equal(await button.evaluate(e=>e.classList.contains('holding')),false);assert.equal(await button.locator('.before').evaluate(e=>getComputedStyle(e).opacity),'0');holds++;
      await button.focus();await page.keyboard.down('Space');assert.ok(await button.evaluate(e=>e.classList.contains('holding')));await page.keyboard.up('Space');assert.equal(await button.evaluate(e=>e.classList.contains('holding')),false);
      await button.evaluate(e=>{e.classList.add('holding');e.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:61}))});assert.equal(await button.evaluate(e=>e.classList.contains('holding')),false);cancelRestores++;
     }
     const linked=await page.locator('#native-pipeline .pair[data-pair]').count();assert.equal(linked,8,'Each group must link CPU and GPU in one row');
     await noOverflow(page,width,scene.id+' expanded');
     caseReport.scenes.push({id:scene.id,cpuTasks:await cpu.count(),gpuTasks:await gpu.count(),decodedImages:await images.count(),holds,cancelRestores,linked,overflow:false});
    }
    await page.locator('#scene').selectOption(defaultId);assert.equal(await page.locator('#pipeline details[open]').count(),0);assert.equal(await page.locator('.holding').count(),0);
    assert.deepEqual(errors,[],'Browser errors');assert.deepEqual(badResponses,[],'Failed requests');caseReport.consoleErrors=errors;caseReport.failedResponses=badResponses;report.cases.push(caseReport);persist();
   }finally{await context.close();context=null}
  }
  report.pass=true;
 }catch(error){report.pass=false;report.failure=String(error.stack||error);throw error}
 finally{if(context)await context.close();report.contextsClosed=true;if(browser)await browser.close();report.browserClosed=true;persist();console.log(JSON.stringify({pass:report.pass,widths:report.cases.map(c=>c.width),report:path.join(directory,'report.json'),browserClosed:report.browserClosed}))}
 return report;
}
async function noOverflow(page,width,where){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Horizontal overflow at '+width+' '+where)}
if(require.main===module){verify(process.argv[2],process.argv[3]).catch(error=>{console.error(error.message);process.exitCode=1})}
module.exports={verify};

'use strict';
const {chromium}=require('/home/suselman/projects/pencil-agents/798-wave-buffer/node_modules/@playwright/test');
const fs=require('node:fs'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
async function verify(target,proofPath){
 const url=/^[a-z]+:/i.test(target)?target:pathToFileURL(target).href;
 const proof={qualification:'Headless Chromium --disable-gpu: interface/images only, not GPU/kernel/timing verification.',cases:[],browserClosed:false};
 const browser=await chromium.launch({args:['--disable-gpu']});
 try{
  for(const width of [320,390,1440]){
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(url);assert.equal(await page.locator('#error').isVisible(),false);
    const scenes=await page.evaluate(()=>JSON.parse(document.getElementById('anatomy-data').textContent).scenes);assert.ok(scenes.length);
    let visited=0,nativeStages=0,images=0,holds=0;
    for(const scene of scenes){
     await page.locator('#scene').selectOption(scene.id);
     for(let ti=0;ti<scene.tracks.length;ti++){
      const track=scene.tracks[ti];await page.locator('#tabs button').nth(ti).click();assert.equal(await page.locator('#chain button').count(),track.stages.length);
      if(track.id==='native')nativeStages+=track.stages.length;
      for(let si=0;si<track.stages.length;si++){
       const stage=track.stages[si];await page.locator('#chain button').nth(si).click();assert.equal(await page.locator('#detail h2').innerText(),stage.label);
       for(const key of ['inputText','actionText','outputText'])assert.ok((await page.locator('#detail').innerText()).includes(stage[key]));
       if(stage.details){const section=page.locator('#detail details').filter({has:page.locator('summary', {hasText:'Подробности расчёта'})});assert.equal(await section.count(),1);await section.locator('summary').click();assert.ok((await section.innerText()).length>24)}
       for(const image of await page.locator('#detail img, #final img').all()){
        await image.evaluate(async e=>{await e.decode();if(!e.complete||e.naturalWidth===0||e.naturalHeight===0)throw Error('Broken image: '+e.src)});images++;
       }
       const surface=page.locator('#detail .compare');
       if(await surface.count()){
        await page.locator('#detail .slider').fill('20');await surface.scrollIntoViewIfNeeded();const box=await surface.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForFunction(()=>document.querySelector('#detail .compare')?.classList.contains('held'));
        assert.equal(await page.locator('#detail .before').evaluate(e=>getComputedStyle(e).clipPath),'inset(0px)');await page.mouse.up();assert.equal(await surface.evaluate(e=>e.classList.contains('held')),false);holds++;
       }
       assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);visited++;
      }
     }
    }
    if(process.env.EXPECTED_NATIVE_STAGES)assert.equal(nativeStages,Number(process.env.EXPECTED_NATIVE_STAGES));
    assert.deepEqual(errors,[]);proof.cases.push({width,scenes:scenes.length,visitedStages:visited,nativeStages,decodedImages:images,holdRestores:holds,overflow:false,errors});
   }finally{await page.close()}
  }
  proof.pass=true;
 }catch(error){proof.pass=false;proof.failure=error.stack;throw error}
 finally{await browser.close();proof.browserClosed=true;if(proofPath)fs.writeFileSync(proofPath,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof))}
 return proof;
}
if(require.main===module){if(!process.argv[2])throw Error('Usage: node verify-ui.cjs file-or-url [proof.json]');verify(process.argv[2],process.argv[3]).catch(e=>{console.error(e.message);process.exitCode=1})}
module.exports={verify};

'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {chromium}=require('/home/suselman/projects/pencil-agents/798-wave-buffer/node_modules/@playwright/test');
async function verify(target,out){
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({args:['--disable-gpu']});
 const proof={scope:'Headless browser: static comparison layout, image content and hold interactions. GPU measurements come from separate real Vega reports.',cases:[]};
 try{
  for(const width of [320,390,1440]){
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(/^[a-z]+:/i.test(target)?target:pathToFileURL(target).href);
    assert.equal(await page.locator('#error').isVisible(),false);assert.equal(await page.locator('.card').count(),4);
    await page.waitForFunction(()=>[...document.querySelectorAll('.variants button')].every(b=>!b.disabled));
    const cards=await page.locator('.card').all();let holds=0,decoded=0;
    for(const card of cards){
     for(const img of await card.locator('img').all()){await img.evaluate(async im=>{await im.decode();if(!im.naturalWidth)throw Error('Broken image')});decoded++}
     // Every chosen fixture has real coloured pigment: a paper-only input is a failed export.
     const coloured=await card.locator('img[alt="Исходный мазок"]').evaluate(img=>{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const g=c.getContext('2d');g.drawImage(img,0,0);const p=g.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<p.length;i+=4)if(Math.max(p[i],p[i+1],p[i+2])-Math.min(p[i],p[i+1],p[i+2])>12)n++;return n});assert.ok(coloured>100,'Input must contain real pigment');
     for(const button of await card.locator('.variants button').all()){
      await button.click();const label=await button.innerText();assert.equal(await button.getAttribute('aria-pressed'),'true');assert.equal(await card.locator('.picture img.visible').count(),1);assert.equal(await card.locator('.picture img.visible').getAttribute('alt'),label);
      const surface=card.locator('.picture');await surface.scrollIntoViewIfNeeded();const box=await surface.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();assert.equal(await card.locator('.shown').innerText(),'Наш исходный алгоритм');await page.mouse.up();assert.equal(await card.locator('.shown').innerText(),label);holds++;
      assert.equal(await surface.evaluate(e=>!e.dispatchEvent(new MouseEvent('contextmenu',{cancelable:true,bubbles:true}))),true);
      assert.equal(await surface.evaluate(e=>getComputedStyle(e).userSelect),'none');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
     }
     for(const button of await card.locator('.tools button').all()){
      const text=await button.innerText();await button.focus();await page.keyboard.down('Space');assert.match(await card.locator('.shown').innerText(),text==='Исходный мазок'?/до растекания/:/служебная карта/);await page.keyboard.up('Space');assert.equal(await button.getAttribute('aria-pressed'),'false');holds++;
     }
    }
    assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'compare-'+width+'.png'),fullPage:true});proof.cases.push({width,cards:4,decodedImages:decoded,holdRestores:holds,inputPigmentVerified:true,overflow:false,errors});
   }finally{await page.close()}
  }
  proof.pass=true;
 }catch(error){proof.pass=false;proof.failure=error.stack;throw error}
 finally{await browser.close();proof.contextsClosed=true;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(proof,null,2)+'\n')}
 return proof;
}
if(require.main===module)verify(process.argv[2],process.argv[3]).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1});
module.exports={verify};

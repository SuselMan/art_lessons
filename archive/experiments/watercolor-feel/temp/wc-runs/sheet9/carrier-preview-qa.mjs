import {chromium} from 'playwright';
import {readFileSync,writeFileSync} from 'node:fs';
const base=readFileSync('/home/suselman/.local/share/stroke-gallery/url','utf8').trim();
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'preview/sheet9-carrier/');
 let loaded=0;
 for(let n=1;n<=6;n++){
  await page.locator('#stroke').selectOption(String(n));
  for(const mode of ['after','wet','motion']){
   await page.locator('#view').selectOption(mode);
   await page.waitForFunction(()=>[...document.querySelectorAll('.panes img')].every(i=>i.complete&&i.naturalWidth>0));loaded++;
  }
 }
 await page.locator('#stroke').selectOption('1');await page.locator('#view').selectOption('after');
 await page.locator('#next').focus();await page.keyboard.press('ArrowRight');if(await page.locator('#stroke').inputValue()!=='2')throw Error('arrow');
 await page.locator('#comment').fill('Draft QA');await page.locator('#next').click();await page.locator('#prev').click();if(await page.locator('#comment').inputValue()!=='Draft QA')throw Error('draft');
 await page.locator('#comment').fill('');
 await page.screenshot({path:'temp/wc-runs/sheet9/carrier-preview-desktop.png'});
 const comments=await page.request.get(base+'comments');if(!comments.ok())throw Error('comments GET');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'temp/wc-runs/sheet9/carrier-preview-mobile.png'});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow||errors.length)throw Error('layout/errors');
 const result={loaded,arrows:true,draft:true,commentsGet:true,overflow,errors};writeFileSync('temp/wc-runs/sheet9/carrier-preview-qa.json',JSON.stringify(result));console.log(result);
}finally{await browser.close()}

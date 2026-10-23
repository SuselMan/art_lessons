import {chromium} from '@playwright/test';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1260,height:850},recordVideo:{dir:'temp/local-qa/video',size:{width:1260,height:850}}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto('http://127.0.0.1:8795');await page.waitForFunction(()=>window.__transportPreview?.ready);
const endpoints=[];const middles=[];
for(const index of ['0','1']){
 await page.selectOption('#case',index);await page.waitForFunction(()=>!document.querySelector('#play').disabled);
 for(const t of [0,1]){
  await page.evaluate(t=>window.__transportPreview.setProgress(t),t);
  endpoints.push(await page.evaluate(()=>{const a=document.querySelector('#fade').getContext('2d').getImageData(0,0,600,380).data,b=document.querySelector('#move').getContext('2d').getImageData(0,0,600,380).data;return a.every((v,i)=>v===b[i])}));
 }
 await page.evaluate(()=>window.__transportPreview.setProgress(.5));
 middles.push(await page.evaluate(()=>{const a=document.querySelector('#fade').getContext('2d').getImageData(0,0,600,380).data,b=document.querySelector('#move').getContext('2d').getImageData(0,0,600,380).data;let sum=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);sum+=d;max=Math.max(max,d)}return {mean:sum/a.length,max}}));
 await page.screenshot({path:`temp/local-qa/middle-${index}.png`});await page.check('#circulation');await page.screenshot({path:`temp/local-qa/fluid-middle-${index}.png`});
 await page.click('#play');await page.waitForTimeout(8300);
}
await page.evaluate(()=>window.__transportPreview.setProgress(.3));const started=Date.now();await page.click('#dry');await page.waitForFunction(()=>document.querySelector('#progress').value==='1000');const acceleratedMs=Date.now()-started;
const normal=await page.locator('#progress').inputValue();await page.close();await browser.close();
const report={errors,acceleratedMs,normal,endpoints,middles};fs.writeFileSync('temp/local-qa/report.json',JSON.stringify(report,null,2));console.log(report);

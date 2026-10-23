import {chromium} from '@playwright/test';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1260,height:850},recordVideo:{dir:'temp/qa/video',size:{width:1260,height:850}}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto('http://127.0.0.1:8794');await page.waitForFunction(()=>window.__transportPreview?.ready);
for (const [name,t] of [['wet',0],['quarter',.25],['middle',.5],['dry',1]]) {await page.evaluate(t=>window.__transportPreview.setProgress(t),t);await page.screenshot({path:`temp/qa/${name}.png`});}
await page.click('#play');await page.waitForTimeout(3500);await page.click('#dry');await page.waitForTimeout(2200);
const endpoints=[];for(const t of [0,1]){await page.evaluate(t=>window.__transportPreview.setProgress(t),t);endpoints.push(await page.evaluate(()=>{const a=document.querySelector('#fade').getContext('2d').getImageData(0,0,600,380).data,b=document.querySelector('#move').getContext('2d').getImageData(0,0,600,380).data;return a.every((v,i)=>v===b[i])}));}
const accelerated=await page.locator('#progress').inputValue();
await page.selectOption('#case','1');await page.waitForTimeout(700);await page.click('#play');await page.waitForTimeout(8500);
const normal=await page.locator('#progress').inputValue();await page.close();await browser.close();
fs.writeFileSync('temp/qa/report.json',JSON.stringify({errors,accelerated,normal,endpoints},null,2));console.log({errors,accelerated,normal,endpoints});

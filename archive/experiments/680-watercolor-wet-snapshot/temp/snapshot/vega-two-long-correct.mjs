// CPU-prepared only. One owned Chrome; two independent cookie contexts.
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
const root=process.env.WC_RELEASE_ROOT;if(!root)throw Error('Explicit WC_RELEASE_ROOT required');
const childPath=resolve(root,'temp/two-peers.mjs');
const out='temp/two-long-correct';mkdirSync(out,{recursive:true});
const url=process.env.APP_URL??'https://127.0.0.1:5305';
let browser,child; const report={scope:'same Vega renderer, independent authenticated participants; not cross-GPU',source:process.env.WC_QA_HEAD??'f99d43ea',stages:[]};
const mark=x=>{report.stages.push({at:new Date().toISOString(),stage:x});writeFileSync(out+'/driver.json',JSON.stringify(report,null,2));};
const wall=setTimeout(()=>{mark('wall-timeout');child?.kill('SIGTERM');void browser?.close().finally(()=>process.exit(124));},180000);
try{
 browser=await chromium.launch({channel:'chrome',headless:false,env:{...process.env,DISPLAY:':0'},args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 for(const[caseName,short,f32]of[['long-native-control','0','0'],['long-native-float32-remap','0','1']]){report.case=caseName;mark('case-start');
 const contexts=await Promise.all([0,1].map(()=>browser.newContext({ignoreHTTPSErrors:true,viewport:{width:900,height:650}})));
 const pages=await Promise.all(contexts.map(c=>c.newPage()));
 await pages[0].goto(url+'/create');await pages[0].locator('form input[type="text"]').first().fill('QA two Vega participants');await pages[0].locator('form button[type="submit"]').click();await pages[0].waitForURL(/\/room\//,{timeout:20000});
 mark('A-created');const room=new URL(pages[0].url()).pathname.split('/').pop();await pages[1].goto(url+'/room/'+room);
 for(const [i,p] of pages.entries()){await p.bringToFront();mark('join-preflight-'+i);await p.waitForFunction(()=>window.__engine||document.querySelector('form input[type="text"]'),null,{timeout:15000});report['preJoin'+i]=await p.evaluate(()=>({href:location.href,body:document.body.innerText.slice(0,500),visibility:document.visibilityState}));mark('join-observed-'+i);if(await p.locator('form input[type="text"]').count()){await p.locator('form input[type="text"]').first().fill('QA owned peer');await p.locator('form button[type="submit"]').click();}await p.waitForFunction(()=>window.__engine&&getComputedStyle(document.querySelector('canvas')).pointerEvents!=='none',null,{timeout:30000});}
 const ids=await Promise.all(pages.map(p=>p.evaluate(()=>sessionStorage.getItem('devbridge:id'))));report.room=room;report.ids=ids;report.preflight=await Promise.all(pages.map(p=>p.evaluate(()=>({visibility:document.visibilityState,user:window.__roomStore.getState().userId,gpu:window.__engine.gpuInfo(),lost:window.__engine.gl.isContextLost()}))));mark('both-joined');
 child=spawn(process.execPath,[childPath,room,'A='+ids[0],'B='+ids[1]],{cwd:root,stdio:'inherit',env:{...process.env,DEVBRIDGE_PORT:'5305',WC_RELEASE_ROOT:root,WC_QA_OUT:out+'/'+caseName,WC_QA_MINIMAL:'1',WC_QA_SHORT:short,WC_QA_F32_NATIVE:f32,WC_QA_HEAD:report.source,WC_QA_SAME_CHROME:'1'}});
 const code=await new Promise((r,j)=>{child.once('exit',r);child.once('error',j)});report.childExit=code;mark('child-finished');if(code!==0)throw Error('peer harness exit '+code);await Promise.all(contexts.map(c=>c.close()));mark('case-contexts-closed');}
}catch(error){report.error=String(error);mark('failure');throw error;}finally{clearTimeout(wall);if(child&&child.exitCode===null)child.kill('SIGTERM');await browser?.close();mark('owned-Chrome-finally-closed');console.log('Two-context Vega Chrome finally closed');}

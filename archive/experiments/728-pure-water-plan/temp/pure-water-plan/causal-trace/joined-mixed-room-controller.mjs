import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';
const {chromium}=createRequire(process.env.QA_DEPS+'/package.json')('playwright');
const app=process.env.QA_APP,root=process.env.QA_RUNTIME,manifestFile=process.env.QA_MANIFEST,out=process.env.QA_OUT;
if(!app||!root||!manifestFile||!out||!process.env.QA_DEPS)throw Error('Explicit app/runtime/manifest/out/deps required');
if(!['5330','5331','5333','5340'].includes(new URL(app).port))throw Error('Only explicitly owned diagnostic port');
const source=JSON.parse(fs.readFileSync(manifestFile));for(const f of source.files){const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f.path))).digest('hex');if(actual!==f.sha256)throw Error('Source SHA mismatch '+f.path)}
const fn=fs.readFileSync(new URL('./joined-mixed-room-function.js',import.meta.url),'utf8');new Function('return '+fn);
if(fs.existsSync(path.join(out,'report.json')))throw Error('Refuse to overwrite retained raw report');fs.mkdirSync(out,{recursive:true});const report={source,helperSHA:crypto.createHash('sha256').update(fn).digest('hex'),cases:[],errors:[],scope:'Ordinary Room fixed native input; field24 roles and whole/material comparisons; no GPU latency claim'};
const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
const mem=()=>Number(fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)[1])/1024;
report.preflightRAM=mem();if(report.preflightRAM<1700)throw Error('RAM preflight1700');save();let browser,context,page,monitor,wall;
try{
 browser=await chromium.launch({channel:'chrome',headless:false,env:{...process.env,DISPLAY:':0'}});
 monitor=setInterval(()=>{if(mem()<500){report.memoryAbort=true;save();void context?.close()}},5000);
 for(const kind of ['water','rgb','noOverlap'])for(const on of [false,true]){
  if(mem()<1700)throw Error('RAM between arms1700');
  const row={input:{kind:kind==='noOverlap'?'water':kind,noOverlap:kind==='noOverlap',on},errors:[]};report.cases.push(row);save();
  wall=setTimeout(()=>{row.wallTimeout=true;save();void context?.close()},240000);
  context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:800,height:600}});page=await context.newPage();
  page.on('pageerror',e=>row.errors.push(String(e)));page.on('requestfailed',r=>row.errors.push({url:r.url(),failure:r.failure()}));
  await page.goto(app+'/create?qa=joinedMixed-'+Date.now()+'-'+kind+'-'+on);
  await page.locator('form input[type=text]').fill('728 mixed joined '+kind+' '+on);
  await page.getByText(/^(Custom|Свой)$/).click();const nums=page.locator('input[type=number]');await nums.nth(0).fill('1754');await nums.nth(1).fill('2480');await page.locator('form button[type=submit]').click();
  await page.waitForFunction(()=>window.__engine&&window.__roomStore&&window.__roomStore.getState().userId!=='local'&&window.__engine._userId===window.__roomStore.getState().userId,{},{timeout:30000});
  row.url=page.url();row.result=await page.evaluate('('+fn+')('+JSON.stringify(row.input)+')');fs.writeFileSync(path.join(out,kind+'-'+(on?'ON':'OFF')+'.png'),Buffer.from(row.result.pngData.split(',')[1],'base64'));delete row.result.pngData;if(row.errors.length)throw Error('App failures '+JSON.stringify(row.errors));row.complete=true;save();clearTimeout(wall);await context.close();context=null;
 }
 for(let i=0;i<report.cases.length;i+=2){const off=report.cases[i].result,on=report.cases[i+1].result;
  const diff=off.fields.filter(x=>{const y=on.fields.find(y=>y.label===x.label);return !y||x.sha!==y.sha||x.absent!==y.absent}).map(x=>x.label);
  const equality={kind:report.cases[i].input,fields:diff,whole:off.whole.sha===on.whole.sha,material:off.materialSHA===on.materialSHA};
  (report.comparisons??=[]).push(equality);save();if(diff.length||!equality.whole||!equality.material)throw Error('Strict mixed endpoint/material mismatch '+JSON.stringify(equality));
 }
 report.complete=true;
}catch(error){report.error=String(error);try{report.failure=await page?.evaluate(()=>({partial:window.__joinedMixedPartial,body:document.body.innerText.slice(0,1000),engine:!!window.__engine,actor:window.__roomStore?.getState().userId,settle:window.__engine?._settle&&{ops:window.__engine._settle.ops.length,next:window.__engine._settle.next},lost:window.__engine?.gl.isContextLost()}))}catch{}process.exitCode=1}
finally{clearInterval(monitor);clearTimeout(wall);await context?.close();await browser?.close();report.ownedChromeClosed=true;save()}

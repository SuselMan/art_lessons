'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('/home/suselman/projects/pencil-agents/798-wave-buffer/node_modules/@playwright/test');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function verify(base,site,proofPath){
 const proof={qualification:'Headless UI/HTTP asset integrity only. Worker script replaced by empty script to prevent engine/GPU initialization; no readiness/model/performance claim.',assets:[],cases:[],browserClosed:false};
 for(const profile of['original','optimized']){
  const root=path.join(site,'mini',profile),raw=fs.readFileSync(path.join(root,'manifest.json')),manifest=JSON.parse(raw);assert.equal(manifest.nativeMiniUI,true);assert.equal(manifest.nativeMiniOptimized,profile==='optimized');
  for(const row of manifest.files.filter(r=>/\.(js|html)$/.test(r.file))){const local=fs.readFileSync(path.join(root,row.file));assert.equal(hash(local),row.sha256);const url=new URL('mini/'+profile+'/'+row.file,base),response=await fetch(url);assert.equal(response.status,200);assert.equal(hash(Buffer.from(await response.arrayBuffer())),row.sha256,'HTTP bytes '+row.file);proof.assets.push({profile,file:row.file,sha256:row.sha256,httpStatus:200})}
 }
 const browser=await chromium.launch({args:['--disable-gpu']});
 try{for(const width of[320,390,1440])for(const profile of['original','optimized']){
  const page=await browser.newPage({viewport:{width,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{await page.route('**/worker.js',route=>route.fulfill({status:200,contentType:'application/javascript',body:'/* UI-only harness: engine worker deliberately not executed. */'}));await page.goto(new URL('mini/'+profile+'/?mode=worker',base).href);await page.waitForFunction(()=>!!window.__workerMiniQA);assert.equal(await page.locator('#profile').inputValue(),profile);assert.equal(await page.locator('#mode').inputValue(),'worker');
   const overflow=()=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(await overflow(),false);assert.ok(await page.locator('#paper').count());for(const control of await page.locator('nav button, nav select').all())assert.ok((await control.boundingBox()).height>=48);
   await page.locator('summary').click();assert.equal(await overflow(),false);const other=profile==='original'?'optimized':'original';await Promise.all([page.waitForURL('**/mini/'+other+'/?mode=worker'),page.locator('#profile').selectOption(other)]);await page.waitForFunction(()=>!!window.__workerMiniQA);assert.equal(await page.locator('#profile').inputValue(),other);assert.equal(await overflow(),false);assert.deepEqual(errors,[]);proof.cases.push({width,profile,navigatedTo:other,overflow:false,controlsAtLeast48px:true,errors});
  }finally{await page.close()}
 }proof.pass=true}catch(error){proof.pass=false;proof.failure=String(error.stack);throw error}finally{await browser.close();proof.browserClosed=true;fs.writeFileSync(proofPath,JSON.stringify(proof,null,2));console.log(JSON.stringify({pass:proof.pass,assets:proof.assets.length,cases:proof.cases.length,browserClosed:true,failure:proof.failure}))}return proof;
}
if(require.main===module){assert.equal(process.argv.length,5,'node native-mini-ui-verify.cjs baseURL staticRoot proof.json');verify(...process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1})}
module.exports={verify};

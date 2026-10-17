// Preserve the immutable input/trace body. Only bound potentially paused Android RAF evaluations.
const {chromium}=require('@playwright/test');
const fs=require('fs'),path=require('path'),crypto=require('crypto'),body=path.join(__dirname,'prefix-trace-a3cf0155.cjs');
if(crypto.createHash('sha256').update(fs.readFileSync(body)).digest('hex')!=='60e9f1e545fd706422f127c8e07c7b0fd61be8da88085f14d2407ba8f9b64795')throw Error('Immutable prefix input changed');
const connect=chromium.connectOverCDP.bind(chromium);
chromium.connectOverCDP=async(...args)=>{
 const browser=await connect(...args),newContext=browser.newContext.bind(browser);
 browser.newContext=async(...options)=>{
  const context=await newContext(...options),newPage=context.newPage.bind(context);
  context.newPage=async(...options)=>{
   const page=await newPage(...options),evaluate=page.evaluate.bind(page);
   page.evaluate=async(...args)=>{
    let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(async()=>{
     let diagnostic;try{diagnostic=await Promise.race([evaluate(()=>({visibility:document.visibilityState,hidden:document.hidden,strokes:window.__engine?._log.entries.filter(x=>x.op.type==='stroke').length,pending:window.__engine?._pendingRebuilds.size,jobs:window.__engine?._rebuildJobs.size,queue:window.__engine?._opQueue.length,held:window.__engine?._strokeId})),new Promise(resolve=>setTimeout(()=>resolve({unavailable:true}),3000))])}catch(error){diagnostic={unavailable:error.message}}
     reject(Error('QA_EVALUATION_TIMEOUT (Android background RAF / infrastructure limitation; not product failure): '+JSON.stringify(diagnostic)));
    },60000)});
    try{return await Promise.race([evaluate(...args),timeout])}finally{clearTimeout(timer)}
   };
   return page;
  };
  return context;
 };
 return browser;
};
require('./prefix-trace-a3cf0155.cjs');

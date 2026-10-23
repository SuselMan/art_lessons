import fs from 'node:fs';import {createHash} from 'node:crypto';import {chromium} from 'playwright';
if(process.env.DISPLAY_GPU_SLOT!=='granted')throw Error('Explicit GPU grant required');
const dir='temp/contact-budget/triangle';fs.mkdirSync(dir,{recursive:true});
const read=n=>fs.readFileSync(dir+'/'+n,'utf8'),ops=JSON.parse(read('timeline-fixed-ops.json')),input=JSON.parse(read('timeline-input.json'));
const report={journalHash:createHash('sha256').update(JSON.stringify(ops)).digest('hex'),source:'frozen5314 with exact8aa emitted dab/paper',inputHashes:input.hashes,runs:[]};const save=()=>fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));
let browser;const wall=setTimeout(()=>browser?.close(),180000);
try{
 browser=await chromium.launch({channel:'chrome',headless:false,env:{...process.env,DISPLAY:':0'}});
 for(const swapped of [false,true]){
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:900,height:800},deviceScaleFactor:1});
  try{
   const page=await context.newPage();page.on('dialog',d=>d.accept());page.on('pageerror',e=>(report.errors??=[]).push(String(e)));
   await page.goto('https://127.0.0.1:5314/?qa=triangle-'+Date.now());
   const boot=await page.evaluate('('+read('timeline-bootstrap-function.js')+')('+JSON.stringify({input})+')');
   if(boot.gl||boot.lost||boot.hits.dab!==2||boot.hits.paper!==1)throw Error('Shader/bootstrap guard');
   const gpu=await page.evaluate(()=>{const g=__timelineEngine.gl,d=g.getExtension('WEBGL_debug_renderer_info');return d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):''});if(!/AMD|Vega|Radeon/.test(gpu))throw Error('Actual Vega required');
   const result=await page.evaluate('('+read('triangle-stage-function.js')+')('+JSON.stringify({ops,swapped,wrapper:read('swapped-band-runtime.js')})+')');
   if(result.gl||result.lost||!result.buffers.some(x=>x.key==='inkLoad'&&x.sum>0)||result.journal.length!==2)throw Error('Material/non-noop journal guard');
   await page.screenshot({path:dir+'/'+(swapped?'swapped':'baseline')+'.png',clip:{x:0,y:0,width:512,height:512}});
   for(const plane of result.planes??[])fs.writeFileSync(dir+'/'+(swapped?'swapped':'baseline')+'-'+plane.tile+'-'+plane.key+'.png',Buffer.from(plane.png,'base64'));delete result.planes;report.runs.push({swapped,gpu,boot,result});save();
   await page.evaluate(()=>{__timelineStopFrames();__timelineEngine.destroy();__restoreTriangleStage();return true});
  }finally{await context.close()}
 }
 report.pass=true;
}catch(e){report.error=String(e);process.exitCode=1}finally{clearTimeout(wall);await browser?.close();report.closed=true;save();console.log(JSON.stringify({pass:report.pass,error:report.error,closed:true,runs:report.runs.map(x=>({swapped:x.swapped,next:x.result.freeze.next,probe:x.result.probe,gl:x.result.gl}))}));}

import fs from 'node:fs';import {createRequire}from'node:module';import{createHash}from'node:crypto';import{gzipSync}from'node:zlib';import path from'node:path';
const ROOT=process.env.WC_RELEASE_ROOT,APP=process.env.APP_URL,OUT=process.env.WC_QA_OUT;
if(!ROOT||!APP||!OUT)throw Error('Explicit runtime/URL/output required');fs.mkdirSync(OUT,{recursive:true});
const {chromium}=createRequire(ROOT+'/package.json')('playwright');
const fn=fs.readFileSync(new URL('./sheet3-mask-split-function.js',import.meta.url),'utf8');new Function('return '+fn);
const manifest=JSON.parse(fs.readFileSync(new URL('./costmask-route52-manifest.json',import.meta.url),'utf8'));
const full=JSON.parse(fs.readFileSync(new URL('./cost-domain-route52-whole-manifest.json',import.meta.url),'utf8'));
const original=fs.readFileSync(new URL('./sheet3-curated42.json',import.meta.url)),inputSHA=createHash('sha256').update(original).digest('hex');if(inputSHA!=='ecbb146ddd9ecf3b6c3c46cc289245d92cbf246cf8225490eea70a9dee3ce1d9')throw Error('Immutable journal mismatch');
const originalOps=JSON.parse(original),ops=originalOps.filter(o=>o.type!=='image_import'),targetOp=ops.find(o=>o.seq===61);if(originalOps.length!==42||ops.length!==41||!targetOp)throw Error('Actual count/target');
for(const op of ops)if(JSON.stringify(op).includes('[cycle]')||op.type==='stroke'&&(!Array.isArray(op.color)||!op.dabsPacked?.startsWith('1:')))throw Error('Actual payload invalid');
const report={manifest,inputSHA,arms:[],executionStages:[],errors:[],network:[],scope:'immutable42, target61-only physical mask OFF/ON; phase/baked fixed; readback diagnostic, no native/ACK/perf claim',harnessSHA:{controller:createHash('sha256').update(fs.readFileSync(new URL('./sheet3-mask-route52-vega-run.mjs',import.meta.url))).digest('hex'),function:createHash('sha256').update(fn).digest('hex')}};
const save=()=>fs.writeFileSync(OUT+'/report.json',JSON.stringify(report,null,2));let browser,page,monitor,progress;
const wall=setTimeout(()=>{report.timeout=true;save();void browser?.close()},600000);
const evaluate=(expression,budget=15000)=>Promise.race([page.evaluate(expression),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Stage budget '+report.stage)),budget);timer.unref()})]);
const savePartial=async saved=>{
 const row=await evaluate('window.__maskSolverSession.out');
 for(const plane of row.planes??[])for(const rec of [...plane.records,...['bandRecord','lift'].map(k=>plane[k]).filter(Boolean)])if(rec.rawKey&&!saved.has(rec.rawKey)){
  const parts=[];for(let offset=0;offset<rec.byteLength;offset+=65536)parts.push(Buffer.from(await evaluate('window.__maskSolverSession.chunk('+JSON.stringify(rec.rawKey)+','+offset+',65536)'),'base64'));
  const raw=Buffer.concat(parts),file=report.arm+'-'+plane.label+'-'+rec.name+'.rgba.gz';rec.sha256=createHash('sha256').update(raw).digest('hex');if(raw.length!==rec.byteLength||rec.sha256!==rec.browserSHA)throw Error('Browser/stream SHA mismatch');fs.writeFileSync(OUT+'/'+file,gzipSync(raw));rec.file=file;saved.add(rec.rawKey);
  await evaluate('Object.assign(window.__maskSolverSession.out.planes.flatMap(p=>[...p.records,p.bandRecord,p.lift].filter(Boolean)).find(r=>r.rawKey==='+JSON.stringify(rec.rawKey)+'),'+JSON.stringify({sha256:rec.sha256,file})+');window.__maskSolverSession.raw.delete('+JSON.stringify(rec.rawKey)+');true');
 }
 report.partial=row;save();return row;
};
try{
 report.memAvailableMiB=Number(fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)[1])/1024;if(report.memAvailableMiB<1700)throw Error('RAM preflight1700');
 for(const file of full.files)if(createHash('sha256').update(fs.readFileSync(path.join(ROOT,file.path))).digest('hex')!==file.sha256)throw Error('Actual source mismatch '+file.path);report.verifiedSourceFiles=full.files.length;report.passport=fs.readFileSync(ROOT+'/temp/onset/source-passport.txt','utf8');if(!report.passport.includes('52fe10ea'))throw Error('Route passport missing');save();
 browser=await chromium.launch({channel:'chrome',headless:false,env:{...process.env,DISPLAY:':0'},args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});const context=await browser.newContext({viewport:{width:1280,height:900},ignoreHTTPSErrors:true});page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));page.on('requestfailed',r=>report.network.push({url:r.url(),error:r.failure()?.errorText}));page.on('dialog',d=>void d.accept());await page.goto(APP+'/cost-domain.html?qa=route52-'+Date.now());
 monitor=setInterval(()=>{report.latestMemAvailableMiB=Number(fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)[1])/1024;if(report.latestMemAvailableMiB<500){report.memoryAbort=true;save();void browser.close()}},15000);
 progress=setInterval(()=>{void evaluate('window.__maskSolverPhase??null',5000).then(p=>{(report.progress??=[]).push({at:new Date().toISOString(),...p});save()}).catch(()=>{})},10000);
 for(const enabled of [false,true]){
  report.arm=enabled?'ON':'OFF';report.stage='setup';save();const input={source:manifest.base,costPaths:enabled,ops,targetId:targetOp.id,roi:{minX:910,minY:455,maxX:1264,maxY:721},targetBox:{minX:1040,minY:552,maxX:1130,maxY:636},finalDry:{id:'s3-immutable-terminal-dry',type:'paper_dry',timestamp:1791345600000,userId:'gallery-render'},strokeLayers:[...new Set(ops.filter(o=>o.type==='stroke').map(o=>o.layerId))]};
  const setup=await evaluate('('+fn+')('+JSON.stringify(input)+')',30000);report.setup=setup;if(!setup.ready)throw Error('Setup guard');const saved=new Set();let row;
  for(const [phase,budget]of[['prefix',210000],['target',90000],['suffix',90000],['export',45000]]){report.stage=phase;save();const t=Date.now(),result=await evaluate('window.__maskSolverSession.run('+JSON.stringify(phase)+')',budget);report.executionStages.push({arm:report.arm,phase,wallMs:Date.now()-t,result,at:new Date().toISOString()});save();if(result.gl||result.lost)throw Error('Stage GL/context guard');row=await savePartial(saved);
   if(phase==='target'&&(row.guards.matchedJobs!==1||!row.guards.singlePaint||row.guards.carryCalls!==14||row.guards.phaseCalls!==14||enabled&&(row.guards.maskCalls!==56||row.guards.maskedCarry!==14||row.maskReachability?.length!==2||row.maskReachability.some(m=>m.differences||!m.nonzero))||!enabled&&(row.guards.maskCalls||row.guards.maskedCarry)))throw Error('Target physical eligibility/operator guard');
  }
  if(row.final){fs.writeFileSync(OUT+'/'+report.arm+'-final.png',Buffer.from(row.final,'base64'));delete row.final;await evaluate('delete window.__maskSolverSession.out.final;true')}
  await evaluate('window.__maskSolverSession.dispose();true');row.engineClosed=true;report.arms.push(row);delete report.partial;save();if(row.error||row.gl||row.lost||row.stageCount!==5)throw Error('Endpoint/stage guard');
  const pre=row.planes.find(p=>p.label==='pre-carry');if(!pre||pre.records.some(r=>r.missing||r.outside||r.invalidScale||r.name!=='cost'&&!r.alphaNonzero))throw Error('Meaningful preinputs guard');
 }
 const pre=report.arms.map(a=>a.planes.find(p=>p.label==='pre-carry').records.map(r=>[r.name,r.sha256,r.read]));report.preInputsExact=JSON.stringify(pre[0])===JSON.stringify(pre[1]);if(!report.preInputsExact)throw Error('Pre-carry inputs changed');report.completed=true;
}catch(error){report.error=String(error);process.exitCode=1;if(page&&!page.isClosed()){try{report.partial=await evaluate('window.__maskSolverPartial?({...window.__maskSolverPartial,final:undefined}):null',5000)}catch{}try{await evaluate('window.__maskSolverSession?.dispose();true',5000)}catch{}}}finally{clearTimeout(wall);clearInterval(monitor);clearInterval(progress);if(browser)await browser.close();report.ownedChromeClosed=true;save()}
console.log(JSON.stringify({completed:report.completed,error:report.error,closed:report.ownedChromeClosed}));

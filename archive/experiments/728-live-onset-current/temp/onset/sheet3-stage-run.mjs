import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';import{createHash}from'node:crypto';import{gzipSync}from'node:zlib';import{join}from'node:path';
const ROOT=process.env.WC_RELEASE_ROOT,APP=process.env.APP_URL,OUT=process.env.WC_QA_OUT??'temp/onset/sheet3-stage',HEAD='7b11b29e';
if(!ROOT||!APP)throw Error('Explicit own runtime/URL required');
const {chromium}=createRequire(ROOT+'/package.json')('playwright');mkdirSync(OUT,{recursive:true});
const original=readFileSync(process.env.WC_STAGE_OPS??'temp/onset/sheet3-curated42.json');const inputSHA=createHash('sha256').update(original).digest('hex');
if(inputSHA!=='ecbb146ddd9ecf3b6c3c46cc289245d92cbf246cf8225490eea70a9dee3ce1d9')throw Error('Immutable curated journal mismatch');
const originalOps=JSON.parse(original),ops=originalOps.filter(o=>o.type!=='image_import'),target=ops.find(o=>o.seq===61);
if(originalOps.length!==42||ops.length!==41||target?.preset!=='normal:100:100:PB29:chisel')throw Error('Actual target/fixture guard');
for(const o of ops){if(JSON.stringify(o).includes('[cycle]'))throw Error('Invalid payload clone');if(o.type==='stroke'&&(!Array.isArray(o.color)||!o.dabsPacked?.startsWith('1:')))throw Error('Invalid actual stroke payload');}
const fn=readFileSync(new URL('./sheet3-stage-function.js',import.meta.url),'utf8');new Function('return '+fn);
const roi={minX:910,minY:455,maxX:1264,maxY:721},targetBox={minX:1040,minY:552,maxX:1130,maxY:636};
const report={source:HEAD,inputSHA,targetId:target.id,slot:2,roi,arms:[],errors:[],scope:'curated42 original input, terminal shared diagnosticDry, no native/ACK/performance claim'};
const save=()=>writeFileSync(OUT+'/report.json',JSON.stringify(report,null,2));let browser,progress;const deadline=setTimeout(()=>{report.timeout=true;save();void browser?.close()},600000);
try{
 const mem=Number(readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)[1])/1024;report.memAvailableMiB=mem;if(mem<1700)throw Error('RAM guard');
 report.passport=readFileSync(ROOT+'/temp/onset/source-passport.txt','utf8');if(!report.passport.includes(HEAD))throw Error('Source passport mismatch');save();
 browser=await chromium.launch({channel:'chrome',headless:false,env:{...process.env,DISPLAY:':0'},args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const ctx=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:900}}),page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(String(e)));page.on('dialog',d=>void d.accept());await page.goto(APP+'/surface-fifo-qa728.html?qa=s3-stage-'+Date.now());
 const finalDry={id:'s3-immutable-terminal-dry',type:'paper_dry',timestamp:Date.now(),userId:'gallery-render'};
 for(const phase of [false,true]){
  report.stage=phase?'ON':'OFF';save();const row=await page.evaluate('('+fn+')('+JSON.stringify({source:HEAD,phase,ops,targetId:target.id,roi,targetBox,finalDry,strokeLayers:[...new Set(ops.filter(o=>o.type==='stroke').map(o=>o.layerId))]})+')');
  for(const plane of row.planes??[])for(const rec of [...plane.records,...['bandRecord','lift'].map(k=>plane[k]).filter(Boolean)])if(rec.rgba){const raw=Buffer.from(rec.rgba,'base64'),file=`${report.stage}-${plane.label}-${rec.name}.rgba.gz`;writeFileSync(join(OUT,file),gzipSync(raw));rec.file=file;rec.sha256=createHash('sha256').update(raw).digest('hex');delete rec.rgba;}
  if(row.final){writeFileSync(OUT+'/'+report.stage+'-final.png',Buffer.from(row.final,'base64'));delete row.final;}
  report.arms.push(row);save();if(row.error||row.gl||row.lost||!row.engineClosed)throw Error(row.error??'GL/lifecycle guard');
  if(!(row.guards.carryCalls>0)||phase&&!(row.guards.phaseCalls>0)||!phase&&row.guards.phaseCalls!==0)throw Error('Actual phase operator gate');
  const pre=row.planes?.find(p=>p.label==='pre-carry');if(row.guards.matchedJobs!==1||row.stageCount!==5||!pre)throw Error('Stage-target selection incomplete');
  if(pre.records.some(r=>r.missing||r.outside||r.invalidScale||r.name!=='cost'&&r.alphaNonzero===0))throw Error('Actual nonzero/map guard');
 }
 const before=report.arms.map(a=>a.planes.find(p=>p.label==='pre-carry').records.filter(r=>['P','V','coverage','cost'].includes(r.name)).map(r=>[r.name,r.sha256,r.map,r.read]));report.preCarryMatched=JSON.stringify(before[0])===JSON.stringify(before[1]);if(!report.preCarryMatched)throw Error('Pre-carry material/input changed');report.completed=true;
}catch(err){report.error=String(err);process.exitCode=1;}finally{clearTimeout(deadline);clearInterval(progress);if(browser)await browser.close();report.ownedChromeClosed=true;save();}

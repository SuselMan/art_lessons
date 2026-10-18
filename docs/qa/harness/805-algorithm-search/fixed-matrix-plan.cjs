'use strict';
const assert=require('node:assert/strict');
const canonical=x=>JSON.stringify(x&&typeof x==='object'?Array.isArray(x)?x.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))])):x);
const requestKey=r=>canonical({algorithm:r.algorithm,fixture:r.fixture,encoding:r.encoding||'premultiplied-rgb',config:r.config||{}});
/** CPU planning only. Never treats an attempted/historical/wrong-source case as complete. */
function planFixedMatrix(manifest,catalog,completedReports=[],sourceHashes,limit=128,verifyImage=()=>false){
 assert.ok(Number.isInteger(limit)&&limit>0&&limit<=256);assert.ok(sourceHashes&&Object.keys(sourceHashes).length);
 const supported=new Set(catalog.algorithms.filter(x=>x.fixedInitialWetSupported===true).map(x=>x.id));
 const fixtures=new Set(catalog.fixtures.map(x=>x.id)),done=new Map();
 for(const report of completedReports){
  if(canonical(report.sourceHashes)!==canonical(sourceHashes)||report.sourceStable!==true||report.contextClosed!==true)continue;
  for(const row of report.cases||[]){const r=row.result;if(row.pass!==true||row.request?.fixedInitialWet!==true||r?.requestedDomainPolicy!=='initial-fixed-v1'||r?.inputUnchanged!==true||r?.initialWetAudit?.dryIdentity!==true||r?.repeatExact!==true||!row.png?.sha256||!verifyImage(row,report))continue;done.set(requestKey(row.request),r.fixtureSHA)}
 }
 const batches=[],blocked=[],completed=[],nonWorker=[];let batch=[];
 const flush=()=>{if(batch.length)batches.push(batch);batch=[]};let previousFixture;
 for(const job of manifest.jobs){
  if(job.kind!=='worker'){nonWorker.push(job.id);continue}
  const input=manifest.inputs[job.inputIndex],request={...job.request,fixedInitialWet:true,expectedInputSHA:input.sha,exportRaw:false,exportRawGzip:true};
  assert.equal(request.fixture,input.reference?.catalogId||request.fixture);assert.ok(input.sha&&Object.keys(input.sha).length===3);
  const key=requestKey(request),before=done.get(key);
  if(before&&canonical(before)===canonical(input.sha)){completed.push(job.id);continue}
  if(!supported.has(request.algorithm)||!fixtures.has(request.fixture)){blocked.push({id:job.id,reason:!supported.has(request.algorithm)?'initial-fixed factory absent':'immutable fixture absent from frozen build'});continue}
  if(previousFixture!==undefined&&previousFixture!==request.fixture)flush();previousFixture=request.fixture;batch.push(request);if(batch.length===limit)flush();
 }
 flush();return{qualification:'CPU queue plan only; no device run implied. Exact frozen build/input and initial-fixed proof required for resuming.',sourceHashes,batches,blocked,completed,nonWorker,summary:{workerReady:batches.reduce((n,b)=>n+b.length,0),workerCompleted:completed.length,workerBlocked:blocked.length,nonWorker:nonWorker.length,batches:batches.length}};
}
module.exports={planFixedMatrix,requestKey,canonical};
if(require.main===module){const fs=require('node:fs'),path=require('node:path'),[manifestFile,catalogFile,hashesFile,out]=process.argv.slice(2);assert.ok(manifestFile&&catalogFile&&hashesFile&&out,'manifest catalog build-hashes output-directory required');const read=p=>JSON.parse(fs.readFileSync(p));const plan=planFixedMatrix(read(manifestFile),read(catalogFile),[],read(hashesFile));fs.mkdirSync(out,{recursive:true,mode:0o700});fs.writeFileSync(path.join(out,'plan.json'),JSON.stringify(plan,null,2),{mode:0o600});for(const [i,batch]of plan.batches.entries())fs.writeFileSync(path.join(out,'batch-'+String(i).padStart(3,'0')+'.json'),JSON.stringify(batch,null,2),{mode:0o600});console.log(JSON.stringify(plan.summary));}

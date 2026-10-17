'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{openOwned,hash}=require('./owned-loader.cjs');
const build=process.env.QA_BUILD,output=process.env.QA_OUTPUT,casesFile=process.env.QA_CASES_FILE;
assert.ok(build&&output&&casesFile,'QA_BUILD/QA_OUTPUT/QA_CASES_FILE required');
const requests=JSON.parse(fs.readFileSync(casesFile));assert.ok(requests.length);fs.mkdirSync(output,{recursive:true,mode:0o700});
const report={startedAt:new Date().toISOString(),qualification:'Fixed1024 flow experiment on physical Samsung. TotalReady includes upload/reduction plus dependent result readiness, not pureGPUtime. Flow metrics/fullRGBA/PNG computed aftertiming. Technical repeat/premul checks do not imply50–200px material transport or artistic acceptance.',cases:[]},sourceByFixture=new Map();
const save=()=>fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2),{mode:0o600});let own;
process.once('SIGINT',()=>{void(async()=>{report.interrupted=true;report.pass=false;try{await own?.close()}finally{save();process.exit(130)}})()});
(async()=>{try{
 own=await openOwned(build);report.sourceHashes=own.sourceHashes;await own.navigate('owned805flow='+Date.now());
 const until=Date.now()+15000;while(!(await own.evaluate('!!window.__algo805'))){if(Date.now()>until)throw Error('Entry bootstrap15s');assert.equal(own.errors.length,0);await new Promise(r=>setTimeout(r,100))}
 await own.evaluate('Promise.race([__algo805.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error("Algorithm bootstrap15s")),15000))])');report.catalog=await own.evaluate('__algo805.list()');save();
 for(const request of requests){const row={request};report.cases.push(row);save();try{
  const result=await own.evaluate('__algo805.run('+JSON.stringify(request)+')');const bytes=Buffer.from(result.png.split(',')[1],'base64');delete result.png;row.result=result;
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(result.repeatExact,true,'Same-input determinism');assert.equal(result.metrics.invalidPremul,0,'Premultiplied carrier');assert.ok(result.samples.every(s=>Number.isFinite(s.totalReadyMs)&&s.totalReadyMs>=0));
  const key=request.fixture+':'+(request.encoding||'premultiplied-rgb');if(sourceByFixture.has(key))assert.deepEqual(result.fixtureSHA,sourceByFixture.get(key),'Same fixture bytes across algorithms/configs');else sourceByFixture.set(key,result.fixtureSHA);row.sameFixtureInput=true;
  row.flow=result.flowMetrics??result.flow;if(process.env.QA_FLOW_REQUIRED!=='0')assert.ok(row.flow&&typeof row.flow==='object','Flow metrics required outside timing');
  row.transportMetrics=result.transportMetrics;if(process.env.QA_EXPECT_CAPTURED==='1')assert.ok(result.captureManifest?.source?.manifest?.commonSHA,'Expected captured native manifest');if(result.captureManifest?.source?.manifest?.commonSHA){assert.deepEqual(result.fixtureSHA,result.captureManifest.source.manifest.commonSHA,'Native capture source bytes');row.captureInputExact=true}
  const name=String(report.cases.length).padStart(3,'0')+'-'+request.algorithm+'-'+request.fixture+'.png';fs.writeFileSync(path.join(output,name),bytes,{mode:0o600});row.png={file:name,bytes:bytes.length,sha256:hash(bytes)};row.pass=true;
  console.log(JSON.stringify({case:report.cases.length,algorithm:request.algorithm,fixture:request.fixture,warmMedianMs:result.warmMedianMs,flow:row.flow,transport:row.transportMetrics,premul:result.metrics.invalidPremul,repeatExact:result.repeatExact}));await own.evaluate('__algo805.clear()');
 }catch(e){row.pass=false;row.failure=e.stack;throw e}finally{save()}}
 own.verifySource();assert.equal(own.errors.length,0);report.sourceStable=true;report.pass=true;
 }catch(e){report.pass=false;report.failure=e.stack;process.exitCode=1}finally{if(own){report.errors=own.errors;report.intercepts=own.intercepts;await own.close();report.contextClosed=true}report.finishedAt=new Date().toISOString();save()}
})();

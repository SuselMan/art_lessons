import test from 'node:test';import assert from 'node:assert/strict';import {actual128DonorFractions,liftActual128Fractions,applyLiftedPairedDriver} from './Actual128PairedDriverAdapter.mjs';import {captureSmallPairedDriver,hashSmallPairedSnapshot} from './CaptureSmallPairedDriver.mjs';
test('actual passstride/time contract retained; plateau donor sum bounded and narrow drygap cannotjump',()=>{const n=128*128,p=new Float64Array(n*4),path=new Float64Array(n*4).fill(1),fluid=new Float64Array(n).fill(.25),oldP=new Float64Array(n*4);oldP[(64*128+64)*4+3]=1;const d=actual128DonorFractions({pressure:p,path,fluid,oldP,passStride:2,passStep:3,epoch:7,options:{band:.8,rate:.5,travel:.35,pow:3,costMax:16,effectiveWet:1,wetLo:.1,wetHi:.9}});assert.equal(d.worldHopPx,16);assert.equal(d.passStep,3);const row=Array.from(d.fractions.slice((64*128+64)*4,(64*128+64)*4+4));assert.ok(row.reduce((a,b)=>a+b,0)<=.175+1e-12);assert.ok(row.every(v=>v>0));const wet=new Uint8Array(n).fill(1);for(let y=0;y<128;y++)wet[y*128+70]=0;const lift=liftActual128Fractions({driver:d,origin:[448,448],side:128,highWet:wet});assert.equal(lift.hop,16);assert.ok(lift.blockedDryEdges>0);assert.equal(lift.fractions[(64*128+64)*4],0);assert.throws(()=>actual128DonorFractions({...d,pressure:p,path,fluid,oldP,passStride:3}),/dimensions/)});
test('OFF capture does not touchGL; current passport rejects before reading anything',()=>{const gl=new Proxy({},{get(){throw Error('TouchedGL')}});assert.equal(captureSmallPairedDriver(gl),null);assert.throws(()=>captureSmallPairedDriver(gl,{enabled:true,ownerSequence:1}),/passport/)});

test('paired actual-hop executor conserves eight channels and identity without modifying source',()=>{
 const side=128,n=side*side,source=new Float64Array(n*8),i=64*side+64;
 for(let c=0;c<8;c++)source[i*8+c]=(c+1)/8;
 const saved=source.slice(),fractions=new Float64Array(n*4),base={fractions,hop:16,boundaryDemand:0,epoch:7,passStep:3,passStride:2};
 assert.deepEqual(applyLiftedPairedDriver({source,side,lift:base}).moments,source);
 fractions[i*4]=.2;fractions[i*4+2]=.3;const result=applyLiftedPairedDriver({source,side,lift:base});
 for(let c=0;c<8;c++){let mass=0;for(let j=0;j<n;j++)mass+=result.moments[j*8+c];assert.ok(Math.abs(mass-source[i*8+c])<1e-14);assert.equal(result.moments[(i+16)*8+c],source[i*8+c]*.2);}
 assert.deepEqual(source,saved);assert.equal(result.hop,16);assert.throws(()=>applyLiftedPairedDriver({source,side,lift:{...base,boundaryDemand:1}}),/fallback/);
});

test('capture reads existing six targets only, restores framebuffer, hashes exact bytes',async()=>{
 const {webcrypto}=await import('node:crypto');let bound='before',reads=0;const gl={FRAMEBUFFER_BINDING:1,FRAMEBUFFER:2,FLOAT:3,UNSIGNED_BYTE:4,RGBA:5,NO_ERROR:0,getParameter:()=>bound,bindFramebuffer:(_,f)=>{bound=f},readPixels:(_x,_y,_w,_h,_fmt,_type,a)=>{reads++;a.fill(.1)},getError:()=>0};
 const fields={};for(const k of ['sourceP','sourceC','fluid','pressure','path','oldP']){const size=['pressure','path','oldP'].includes(k)?128:1024;fields[k]={fbo:k,texture:k,width:size,height:size};}
 const snapshot=captureSmallPairedDriver(gl,{enabled:true,ownerSequence:2,epoch:0,passStep:1,passStride:1,origin:[448,448],fields,packedSha:'a'.repeat(64),paperSha:'b'.repeat(64)});
 assert.equal(reads,6);assert.equal(bound,'before');assert.equal(snapshot.passport.bytes,589824);const passport=await hashSmallPairedSnapshot(snapshot,webcrypto.subtle);assert.equal(Object.keys(passport.rawSha256).length,6);assert.ok(Object.values(passport.rawSha256).every(v=>/^[a-f0-9]{64}$/.test(v)));
 gl.readPixels=()=>{throw Error('read failed')};assert.throws(()=>captureSmallPairedDriver(gl,{enabled:true,ownerSequence:2,epoch:0,passStep:1,passStride:1,origin:[448,448],fields,packedSha:'a'.repeat(64),paperSha:'b'.repeat(64)}),/read failed/);assert.equal(bound,'before');
});
test('captured CPU end-to-end retains exact passport and rejects stale/stride/wet/ROI state',async()=>{
 const {runCapturedPairedCandidate}=await import('./RunCapturedPairedCandidate.mjs');const {webcrypto}=await import('node:crypto');
 const n=16384,source=new Float64Array(n*8);source[(64*128+64)*8+3]=1;
 const p={ownerSequence:2,epoch:0,passStep:1,passStride:1,origin:[448,448],side:128,packedSha:'a'.repeat(64),paperSha:'b'.repeat(64),bytes:589824};
 const snapshot={passport:p,source,highWet:new Uint8Array(n).fill(1),raw:Object.fromEntries(['sourceP','sourceC','fluid','pressure','path','oldP'].map(k=>[k,new Uint8Array(4)])),driver:{pressure:new Float64Array(n*4),path:new Float64Array(n*4),fluid:new Float64Array(n),oldP:new Float64Array(n*4),epoch:0,passStep:1,passStride:1,options:{band:.8,rate:.5,travel:.35,pow:3,costMax:16,effectiveWet:1,wetLo:.1,wetHi:.9}}};
 const options={sourceHead:'test-head',stage:'before-carry',subtle:webcrypto.subtle,currentPassport:()=>({...p,sourceHead:'test-head',stage:'before-carry'})};
 const r=await runCapturedPairedCandidate(snapshot,options);assert.deepEqual(r.result.moments,source);assert.equal(r.promotion.allowed,true);
 await assert.rejects(()=>runCapturedPairedCandidate(snapshot,{...options,currentPassport:()=>({...p,epoch:1})}),/Stale/);
 await assert.rejects(()=>runCapturedPairedCandidate({...snapshot,driver:{...snapshot.driver,passStride:2}},options),/mismatch/);
 await assert.rejects(()=>runCapturedPairedCandidate({...snapshot,highWet:null},options),/wet/);
 await assert.rejects(()=>runCapturedPairedCandidate({...snapshot,passport:{...p,origin:[1024,0]}},options),/mapping/);
});

test('positive executor refuses overdraw and escaped endpoint before evidence promotion',()=>{
 const side=128,n=side*side,source=new Float64Array(n*8),fractions=new Float64Array(n*4);source[3]=1;const lift={fractions,hop:8,boundaryDemand:0};
 fractions[0]=.6;fractions[1]=.5;assert.throws(()=>applyLiftedPairedDriver({source,side,lift}),/available mass/);
 fractions[0]=0;fractions[1]=.2;assert.throws(()=>applyLiftedPairedDriver({source,side,lift}),/escaped/);
 fractions[1]=NaN;assert.throws(()=>applyLiftedPairedDriver({source,side,lift}),/fraction/);
});
test('owned before-carry receipt permits later pass progression but rejects changed source epoch',async()=>{
 const {installOwnedBeforeCarryCapture,validateCapturedIdentity}=await import('./OwnedBeforeCarryCapture.mjs');let passStep=1,canonicalCalls=0,captured;
 const base={ownerSequence:2,epoch:0,passStride:1,packedSha:'a'.repeat(64),paperSha:'b'.repeat(64),sourceHead:'head'};
 const passes={fieldOp(){canonicalCalls++;passStep++;return 42}};const original=passes.fieldOp;
 const installed=installOwnedBeforeCarryCapture({passes,enabled:true,describe:()=>({...base,passStep}),capture:()=>({passport:{...base,passStep}}),onCaptured:r=>{captured=r}});
 assert.equal(passes.fieldOp(null,null,null,15,.5),42);assert.equal(canonicalCalls,1);assert.equal(installed.armed,false);assert.equal(passes.fieldOp,original);assert.equal(captured.receipt.passStep,1);assert.equal(passStep,2);
 assert.equal(validateCapturedIdentity(captured.snapshot,{...base,passStep:9}).epoch,0);
 assert.throws(()=>validateCapturedIdentity(captured.snapshot,{...base,epoch:1}),/identity/);
 installed.dispose();
});
test('diagnostic exception never prevents canonical carry',async()=>{
 const {installOwnedBeforeCarryCapture}=await import('./OwnedBeforeCarryCapture.mjs');let calls=0,observed;const passes={fieldOp(){calls++}};
 installOwnedBeforeCarryCapture({passes,enabled:true,describe:()=>({ownerSequence:2}),capture(){throw Error('capture failure')},onCaptured:r=>{observed=r}});
 passes.fieldOp(null,null,null,15,.5);assert.equal(calls,1);assert.match(observed.error.message,/capture failure/);
});
test('MRT dispatch and fallback capture once without changing production flags',async()=>{
 const {installOwnedBeforeCarryCapture}=await import('./OwnedBeforeCarryCapture.mjs');
 for(const accepted of [true,false]){
  let reads=0,pairs=0,legacy=0,route;const passes={diagnosticCarryMrt:true,fieldOp(){legacy++},carryPair(){pairs++;return accepted}};const originalPair=passes.carryPair,originalOp=passes.fieldOp;
  installOwnedBeforeCarryCapture({passes,enabled:true,describe:()=>({ownerSequence:2,epoch:0,passStep:1,passStride:2}),capture:(_a,_p,r)=>{reads++;route=r;return{};}});
  const paired=passes.carryPair(null,null,null,null,null,.5,{origin:[2,.35]});if(!paired){passes.fieldOp(null,null,null,16,.5);passes.fieldOp(null,null,null,15,.5);}
  assert.equal(reads,1);assert.equal(pairs,1);assert.equal(legacy,accepted?0:2);assert.equal(route,'carryPair-dispatch');assert.equal(passes.diagnosticCarryMrt,true);assert.equal(passes.carryPair,originalPair);assert.equal(passes.fieldOp,originalOp);
 }
});
test('actual visual before-carry callback sees exact bindings; throwing diagnostics cannot block C/P',async()=>{
 const {previewMultiscaleCarry}=await import('./PreviewMultiscaleCarry.mjs');const field=(name,side=128)=>({texture:name,width:side,height:side});
 const targets=Object.fromEntries(['oldP','oldC','outP','outC','fixedP'].map(k=>[k,field(k)]));const source={solventLoad:field('solvent',1024)};const pressure=field('pressure'),water=field('water'),fields=[field('mask0'),field('mask1')];const calls=[];let observed;
 const input={targets,source,options:{budgetPx:20,costMax:16,rate:.5,pow:3,travel:.35,effectiveWet:1,wetLo:.1,wetHi:.9}};
 const passes={costDomainStep(){},fieldOp(...args){calls.push(args)}};
 previewMultiscaleCarry({passes,seed:{draw(){}},pressure,water,pathLease:{fields},input,stride:2,beforeCarry:r=>{observed=r;throw Error('diagnostic failure')}});
 assert.equal(observed.input,input);assert.equal(observed.pressure,pressure);assert.equal(observed.path,fields[1]);assert.equal(observed.stride,2);assert.deepEqual(calls.map(a=>a[3]),[16,15]);assert.deepEqual(calls[0][5].origin,[2,.35]);assert.equal(calls[0][5].c,targets.oldP);assert.match(globalThis.__ownedBeforeCarryError,/failure/);delete globalThis.__ownedBeforeCarryError;
 calls.length=0;previewMultiscaleCarry({passes,seed:{draw(){}},pressure,water,pathLease:{fields},input,stride:1});assert.deepEqual(calls.map(a=>a[3]),[16,15]);assert.equal(globalThis.__ownedBeforeCarryError,undefined);
});
test('snapshot captured callback survives global removal and repeated later steps safely',async()=>{
 const {installActualPairedSnapshot}=await import('./InstallActualPairedSnapshot.mjs');
 const gl={FRAMEBUFFER_BINDING:1,FRAMEBUFFER:2,FLOAT:3,UNSIGNED_BYTE:4,RGBA:5,NO_ERROR:0,getParameter:()=>null,bindFramebuffer(){},readPixels(_x,_y,_w,_h,_fmt,type,a){a.fill(type===3?.1:255)},getError:()=>0};
 const field=(name,size)=>({fbo:name,texture:name,width:size,height:size});const source={pigmentLoad:field('P',1024),colourLoad:field('C',1024),solventLoad:field('water',1024)};
 const owner={token:{sequence:2},source:{epoch:0,chunks:[{commands:[],composite:{color:[.3,.15,.55]}}]}};
 const install=installActualPairedSnapshot(gl,{sourceHead:'head',paperSha:'b'.repeat(64),packedSha:'0'.repeat(64)}),held=globalThis.__captureOwnedBeforeCarry;
 const r={owner,epoch:0,passStep:0,stride:1,pressure:field('pressure',128),path:field('path',128),input:{source,targets:{oldP:field('old',128)},options:{budgetPx:20,costMax:24,rate:.5,travel:.35,pow:3,effectiveWet:1,wetLo:.45,wetHi:.7}}};
 held(r);assert.equal(globalThis.__captureOwnedBeforeCarry,undefined);held({...r,passStep:1});held({...r,passStep:2});const result=await install.ready;assert.equal(result.valid,true);assert.equal(result.candidate.passport.passStep,0);install.dispose();
});

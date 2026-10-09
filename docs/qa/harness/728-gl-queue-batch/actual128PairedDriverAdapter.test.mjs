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

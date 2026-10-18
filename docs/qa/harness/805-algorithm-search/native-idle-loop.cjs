'use strict';
// Serializable browser helper. Worker timing boundaries are untouched.
async function runNativeIdle(request,repeats,idleMs,wait=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>performance.now()){
 if(![0,5000].includes(idleMs)||!Number.isInteger(repeats)||repeats<1)throw Error('Invalid native idle protocol');
 if(idleMs===0)return request({type:'qa-run-scene-goal',repeats,endpoint:true});
 const samples=[],hashes=[];let last,first,raw;
 for(let i=0;i<repeats;i++){
  let idleBeforeSampleMs=0;if(i){const start=now();await wait(idleMs);idleBeforeSampleMs=now()-start;}
  const r=await request({type:'qa-run-scene-goal',repeats:1,endpoint:true});
  if(r.repeatExact!==true||r.samples?.length!==1||r.hashes?.length!==1)throw Error('Invalid singleton native result');
  const signature=JSON.stringify(r.hashes[0]);if(i&&signature!==first)throw Error('Native idle output changed');first??=signature;
  const source=JSON.stringify(r.rawSHAAfter);if(i&&source!==raw)throw Error('Native idle source changed');raw??=source;
  samples.push({...r.samples[0],idleBeforeSampleMs});hashes.push(r.hashes[0]);last=r;
 }
 return{...last,samples,hashes,repeatExact:true};
}
module.exports={runNativeIdle};

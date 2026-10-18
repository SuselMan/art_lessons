'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const sha=a=>crypto.createHash('sha256').update(a).digest('hex');
function audit({before,after,water,size,immutableSHA,ledger}){
 assert.ok(Number.isInteger(size)&&size>0);assert.equal(before.length,size*size*4);assert.equal(after.length,before.length);assert.equal(water.length,size*size);
 assert.deepEqual({rgba:sha(before),water:sha(water)},immutableSHA,'Immutable uploaded source/mask');
 let dryPixels=0,dryChangedBytes=0,invalidPremul=0;const beforeSum=[0,0,0,0],afterSum=[0,0,0,0];
 for(let i=0;i<water.length;i++){if(!water[i])dryPixels++;for(let k=0;k<4;k++){beforeSum[k]+=before[i*4+k];afterSum[k]+=after[i*4+k];if(!water[i]&&before[i*4+k]!==after[i*4+k])dryChangedBytes++;if(after[i*4+k]>after[i*4+3])invalidPremul++}}
 assert.equal(dryChangedBytes,0,'Dry original RGBA byte identity');assert.equal(invalidPremul,0,'Bounded output carrier');
 assert.ok(ledger&&Array.isArray(ledger.initial)&&Array.isArray(ledger.final),'Explicit all-four pre-quantization ledgers required');
 assert.equal(ledger.initial.length,4);assert.equal(ledger.final.length,4);assert.deepEqual(ledger.final,ledger.initial,'Conserved pre-quantization RGBA ledger');
 return{dryPixels,dryChangedBytes,invalidPremul,immutableSHA,outputSHA:sha(after),byteSums:{before:beforeSum,after:afterSum,delta:afterSum.map((v,k)=>v-beforeSum[k])},ledger,qualification:'Conservation applies to supplied pre-quantization ledger; final byte rounding deltas shown separately, never silently clamped.'};
}
function metadataLedger(metadata){
 const f=metadata?.fineLedger,p=metadata?.partition;assert.ok(f&&p,'B-lite partition/fine ledger required');
 assert.equal(f.conserved,true);assert.equal(f.invalid,0);assert.equal(f.dryChanged,0);assert.deepEqual(f.delta,[0,0,0,0]);
 for(const key of ['totals','expected'])assert.equal(f[key]?.length,4,'Fine '+key+' RGBA');
 assert.deepEqual(f.totals,f.expected);const c=f.coarseLedger;assert.ok(c,'Coarse ledger required');
 assert.deepEqual(c.coarsePigmentDeltaRGBA,[0,0,0,0]);assert.equal(c.coarsePigmentConserved,true);
 assert.equal(c.coarseGuardPassed,true);assert.equal(c.prePackGuardPassed,true);
 return{initial:f.expected,final:f.totals,partition:p,coarse:c};
}
module.exports={audit,sha,metadataLedger};

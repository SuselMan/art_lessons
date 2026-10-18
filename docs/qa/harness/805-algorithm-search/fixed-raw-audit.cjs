'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
/** Independent Node parser of exported bytes; no renderer, worker counters or repair. */
function auditFixedRaw({inputBytes,output,inputSHA,sourceHashes,size=1024}){
 const N=size*size;assert.equal(inputBytes.length,N*6);assert.equal(output.length,N*4);assert.ok(sourceHashes&&Object.keys(sourceHashes).length);
 const rgba=inputBytes.subarray(0,N*4),water=inputBytes.subarray(N*4,N*5),paper=inputBytes.subarray(N*5);
 const actual={rgba:sha(rgba),water:sha(water),paper:sha(paper)};assert.deepEqual(actual,inputSHA,'Frozen full input SHA');
 let changedDryPixels=0,changedDryChannels=0,invalidPremulPixels=0,maxPremulExcess=0;const before=[0,0,0,0],after=[0,0,0,0];
 for(let i=0;i<N;i++){let dryChanged=false,invalid=false;for(let k=0;k<4;k++){const a=rgba[i*4+k],b=output[i*4+k];before[k]+=a;after[k]+=b;if(water[i]===0&&a!==b){changedDryChannels++;dryChanged=true}if(k<3&&b>output[i*4+3]){invalid=true;maxPremulExcess=Math.max(maxPremulExcess,b-output[i*4+3])}}changedDryPixels+=Number(dryChanged);invalidPremulPixels+=Number(invalid)}
 return{pass:changedDryPixels===0&&invalidPremulPixels===0,rawSHA:sha(output),inputSHA:actual,sourceHashes,changedDryPixels,changedDryChannels,invalidPremulPixels,maxPremulExcess,rawRGBAByteSums:{before,after,delta:after.map((x,k)=>x-before[k])},qualification:'Independent full raw-byte audit. Dry original exact; bounded carrier checked. Byte sums are diagnostics, not a global physical conservation claim.'}
}
module.exports={auditFixedRaw};

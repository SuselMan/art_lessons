import {compareRows} from '../728-crossgpu-neighborhood/compare.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
export function comparePhysical(a,b){
 if(a.length!==b.length)return{invalid:'physical capture count mismatch',counts:[a.length,b.length]};
 const deltas=[],unknown=[];let previousCapturedBytesEqual=null,previousFullyKnownInput=null;
 for(let i=0;i<a.length;i++){
  const x=a[i],y=b[i],align=r=>JSON.stringify({op:r.op,ordinal:r.ordinal,stage:r.stage,options:{...r.options,donorCapture:undefined},keys:Object.keys(r.fields)});
  if(align(x)!==align(y))return{invalid:'operation/pass/options/order mismatch',row:i};
  let same=true;
  for(const key of Object.keys(x.fields)){
   const u=x.fields[key],v=y.fields[key],frame=f=>JSON.stringify({role:f.role,size:f.size,meta:f.meta,read:f.read,sampler:f.sampler,absent:f.absent,outside:f.outside,unmapped:f.unmapped});
   if(frame(u)!==frame(v))return{invalid:'physical frame/sampler mismatch',row:i,key};
   if(!u.bytes||!v.bytes){if(u.unmapped||v.unmapped){unknown.push({row:i,key});same=false;previousFullyKnownInput=null}continue}
   if(u.bytes.length!==v.bytes.length)return{invalid:'read size mismatch',row:i,key};let count=0,max=0;
   for(let j=0;j<u.bytes.length;j++){const d=Math.abs(u.bytes[j]-v.bytes[j]);if(d)count++;max=Math.max(max,d)}
   if(count){same=false;deltas.push({row:i,op:x.op,ordinal:x.ordinal,stage:x.stage,key,count,max,previousCapturedBytesEqual,previousFullyKnownInput})}
  }
  const dc=x.options?.donorCapture,ec=y.options?.donorCapture;
  if(!!dc!==!!ec)return{invalid:'donor capture presence mismatch',row:i};
  if(dc){const result=compareRows([{op:x.op,stage:x.stage,meta:{},fields:{},...dc}],[{op:y.op,stage:y.stage,meta:{},fields:{},...ec}]);if(result.invalid)return{invalid:result.invalid,row:i};for(const delta of result.deltas){same=false;deltas.push({...delta,row:i,ordinal:x.ordinal,count:delta.numDiff,previousCapturedBytesEqual,previousFullyKnownInput:null})}unknown.push(...result.unknowns.map(u=>({...u,row:i})));}
  // Local capture does not cover all shader inputs, including external textures.
  previousFullyKnownInput=null;
  if(same)previousCapturedBytesEqual=i;
 }
 return{aligned:true,rows:a.length,firstCaptured:deltas[0]??null,deltas,unmapped:unknown,shaderInputsEqual:false,scope:'First captured local byte divergence; missing stencil halos/foreign-flow/paper GPU sampling forbid causal first-physical-input claim'};
}
if(process.argv[2]){const a=JSON.parse(readFileSync(process.argv[2])),b=JSON.parse(readFileSync(process.argv[3])),ar=a.result??a,br=b.result??b;const result={paperEqual:!!ar.paperBytesSHA&&!!br.paperBytesSHA&&ar.paperBytesSHA===br.paperBytesSHA,summary:[ar.neighborhood.summary,br.neighborhood.summary],comparison:comparePhysical(ar.neighborhood.rows,br.neighborhood.rows)};if(process.argv[4])writeFileSync(process.argv[4],JSON.stringify(result,null,2));console.log(JSON.stringify(result))}

'use strict';
// Independent exact-integer audit of the bounded scalar reconstruction, not a coupled-solver/TVD oracle.
const assert=require('node:assert/strict'),vm=require('node:vm'),esbuild=require('/home/suselman/projects/pencil-agents/805-watercolor-search/node_modules/esbuild');
const moduleObject={exports:{}};
vm.runInNewContext(esbuild.buildSync({entryPoints:[__dirname+'/macro28-limited-advection-core.ts'],bundle:true,format:'cjs',platform:'node',write:false}).outputFiles[0].text,{module:moduleObject,exports:moduleObject.exports});
const {limitedAlpha}=moduleObject.exports;
let seed=805,maxProduct=0n;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n};
function exact(a,q,free){
 const [M,W,R,RW,U,UW]=a.map(BigInt),Q=BigInt(q),C=M*256n/W,CU=U*256n/UW,CR=R*256n/RW,left=C-CU,right=CR-C;
 const slope=left>0n&&right>0n?(left<right?left:right):left<0n&&right<0n?(left>right?left:right):0n;
 const factor=(W-Q)*256n/W,product=Q*(slope<0n?-slope:slope)*factor,base=(M*Q+W/2n)/W,correction=(product+65536n)/131072n;
 const adjusted=slope>=0n?base+correction:base>correction?base-correction:0n;
 return{alpha:[M,BigInt(free),adjusted].reduce((x,y)=>x<y?x:y),product};
}
for(let i=0;i<150000;i++){
 const values=[random(65536),1+random(65535),random(65536),1+random(65535),random(65536),1+random(65535)],q=random(Math.floor(values[1]*4/5)+1),free=random(65536),reference=exact(values,q,free),actual=limitedAlpha(...values,q,free);
 assert.equal(BigInt(actual.alpha),reference.alpha,'alpha mismatch at'+i);assert.equal(BigInt(actual.correctionProduct),reference.product,'product mismatch at'+i);assert.ok(reference.product<=1073725440n);if(reference.product>maxProduct)maxProduct=reference.product;
}
assert.equal(maxProduct,1029355470n);
console.log(JSON.stringify({seed:805,cases:150000,zeroDiff:true,maxCorrectionProduct:String(maxProduct),analyticalUpperBound:1073725440,qualification:'CPU exact integer scalar reconstruction; no coupled solver TVD or GPU compiler proof'}));

'use strict';
/** CPU artistic reconstruction proxy. All sums exact per8x8cell; not a new flow, GPU algorithm, or native reconstruction. */
function reconstruct({size,initial,water,target,stationary,strength=1}){
 if(!Number.isInteger(size)||size%8||initial.length!==size*size*4||target.length!==initial.length||water.length!==size*size||stationary.length!==size*size||![0,.5,1].includes(strength))throw Error('Invalid detail input');
 const output=Uint8Array.from(target),summary={cells:0,changedCells:0,changedPixels:0,positiveResidualCells:0,kZeroCells:0,kSum:0,kSumResidual:0,stationarySlots:0,roundingFallbackCodes:0,allFourCellSumsExact:true};
 for(let y=0;y<size;y+=8)for(let x=0;x<size;x+=8){const slots=[],sum=[0,0,0,0],targetSum=[0,0,0,0];for(let dy=0;dy<8;dy++)for(let dx=0;dx<8;dx++){const i=(y+dy)*size+x+dx,p=i*4;if(stationary[i]){summary.stationarySlots++;continue}slots.push(i);for(let c=0;c<4;c++){if(initial[p+c]>initial[p+3]||target[p+c]>target[p+3])throw Error('Invalid premul carrier');sum[c]+=water[i]?initial[p+c]:0;targetSum[c]+=target[p+c]}}
  summary.cells++;if(!slots.length)continue;const n=slots.length,R=slots.map(i=>sum.map((v,c)=>n*(water[i]?initial[i*4+c]:0)-v));let numerator=1,denominator=1;const bound=(a,b)=>{if(a<0||b<=0)throw Error('Invalid bound');if(a*denominator<numerator*b){numerator=a;denominator=b}};
  for(let j=0;j<n;j++){const i=slots[j],p=i*4,r=R[j];for(let c=0;c<4;c++)if(r[c]<0)bound(target[p+c],-r[c]);if(r[3]>0)bound(255-target[p+3],r[3]);for(let c=0;c<3;c++)if(r[3]-r[c]<0)bound(target[p+3]-target[p+c],r[c]-r[3])}
  if(R.some(r=>r.some(v=>v)))summary.positiveResidualCells++;if(numerator===0)summary.kZeroCells++;if(strength===0)numerator=0;else if(strength===.5)denominator*=2;summary.kSum+=numerator/denominator;if(R.some(r=>r.some(v=>v)))summary.kSumResidual+=numerator/denominator;
  const fractions=Array.from({length:4},()=>[]),values=slots.map((i,j)=>[0,1,2,3].map(c=>{const v=target[i*4+c]*denominator+numerator*R[j][c];if(v<0)throw Error('Negative rational');const floor=Math.floor(v/denominator);fractions[c].push({j,remainder:v-floor*denominator});return floor}));
  // Alpha first. Then RGB can be rounded under the alreadyfixed integer alpha cap.
  for(const c of[3,0,1,2]){let remaining=targetSum[c]-values.reduce((s,v)=>s+v[c],0);if(remaining<0)throw Error('Rounding sum invalid');const order=fractions[c].sort((a,b)=>b.remainder-a.remainder||a.j-b.j);for(const {j}of order){if(!remaining)break;if(values[j][c]<(c===3?255:values[j][3])){values[j][c]++;remaining--}}if(remaining){for(const {j}of order){const add=Math.min(remaining,(c===3?255:values[j][3])-values[j][c]);values[j][c]+=add;remaining-=add;summary.roundingFallbackCodes+=add;if(!remaining)break}}if(remaining)throw Error('Insufficient rounding capacity')}
  let changed=false;const check=[0,0,0,0];for(let j=0;j<n;j++){const i=slots[j],p=i*4,v=values[j];if(v.some(a=>a<0||a>v[3])||v[3]>255)throw Error('Output guard');let different=false;for(let c=0;c<4;c++){output[p+c]=v[c];check[c]+=v[c];different||=v[c]!==target[p+c]}if(different){summary.changedPixels++;changed=true}}if(check.some((v,c)=>v!==targetSum[c]))throw Error('Cell mass changed');if(changed)summary.changedCells++;
 }
 return{output,summary};
}
module.exports={reconstruct};

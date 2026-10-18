/** CPU policy oracle ONLY. Coarse full-wet bulk + mobile raw fine boundary; no GPU/model installer. */
export interface FixedWetInput {size:number;rgba:Uint8Array;water:Uint8Array}
const sum4=(a:Uint32Array)=>{const s=[0,0,0,0];for(let i=0;i<a.length;i++)s[i%4]+=a[i];return s}
export function partitionFixedWet(input:FixedWetInput){
 const {size,rgba,water}=input,n=size*size,c=size/8
 if(!Number.isInteger(size)||size<16||size>128||size%8||rgba.length!==n*4||water.length!==n)throw Error('CPU fixedwet size16..128 multiple8')
 const active=new Uint8Array(c*c),kind=new Uint8Array(n),literal=new Uint8Array(n*4),boundary=new Uint32Array(n*4),coarseM=new Uint32Array(c*c*4),coarseD=new Uint32Array(c*c*4),rawTotals=[0,0,0,0],rawBulk=[0,0,0,0],rawBoundary=[0,0,0,0],rawLiteral=[0,0,0,0]
 for(let i=0;i<n;i++)for(let k=0;k<4;k++){if(rgba[i*4+k]>rgba[i*4+3])throw Error('Bounded common carrier premul required');rawTotals[k]+=rgba[i*4+k]*257}
 for(let cy=0;cy<c;cy++)for(let cx=0;cx<c;cx++){
  let full=true;for(let dy=0;dy<8;dy++)for(let dx=0;dx<8;dx++)full&&=water[(cy*8+dy)*size+cx*8+dx]>0
  const owner=cy*c+cx;active[owner]=Number(full);const sums=[0,0,0,0]
  for(let dy=0;dy<8;dy++)for(let dx=0;dx<8;dx++){
   const i=(cy*8+dy)*size+cx*8+dx;kind[i]=water[i]===0?0:full?1:2
   for(let k=0;k<4;k++){const v=rgba[i*4+k];if(kind[i]===0){literal[i*4+k]=v;rawLiteral[k]+=v*257}else if(full){sums[k]+=v;rawBulk[k]+=v*257}else{boundary[i*4+k]=v*257;rawBoundary[k]+=v*257}}
  }
  if(full)for(let k=0;k<4;k++)coarseM[owner*4+k]=Math.floor((sums[k]*257+32)/64)
 }
 const coarseTotals=sum4(coarseM),quantizationDelta=coarseTotals.map((v,k)=>64*v-rawBulk[k])
 return{size,coarseSize:c,active,kind,literal,boundary,coarseM,coarseD,rawTotals,rawBulk,rawBoundary,rawLiteral,coarseTotals,quantizationDelta}
}
/** Four disjoint parity phases. Same coefficient for RGBA; alpha capacity limits coefficient, not each channel. */
export function quarterPairs(m:Uint32Array,d:Uint32Array,mask:Uint8Array,n:number,phase:number,coarseOrder=false){
 if(!Number.isInteger(phase)||phase<0||phase>3||m.length!==n*n*4||d.length!==m.length||mask.length!==n*n)throw Error('Pair geometry')
 for(let i=0;i<n*n;i++)for(let k=0;k<4;k++)if(m[i*4+k]>m[i*4+3]||d[i*4+k]>d[i*4+3]||m[i*4+3]+d[i*4+3]>65535)throw Error('Pair input premul/capacity')
 const out=m.slice(),axis=coarseOrder?phase%2:Math.floor(phase/2),offset=coarseOrder?Math.floor(phase/2):phase%2;let openPairs=0,changedPairs=0
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const coord=axis===0?x:y;if((coord+2-offset)%2!==0)continue;const xx=x+Number(axis===0),yy=y+Number(axis===1);if(xx>=n||yy>=n)continue
  const a=y*n+x,b=yy*n+xx;if(!mask[a]||!mask[b])continue;openPairs++
  const da=m[b*4+3]-m[a*4+3],receiver=da>=0?a:b,free=65535-d[receiver*4+3]-m[receiver*4+3],rate=da===0?64:Math.min(64,Math.floor(free*256/Math.abs(da)));let changed=false
  for(let k=0;k<4;k++){const delta=m[b*4+k]-m[a*4+k],q=Math.sign(delta)*Math.floor((Math.abs(delta)*rate+128)/256);out[a*4+k]+=q;out[b*4+k]-=q;changed||=q!==0}
  if(changed)changedPairs++
 }
 for(let i=0;i<n*n;i++)for(let k=0;k<4;k++)if(out[i*4+k]>out[i*4+3]||out[i*4+3]+d[i*4+3]>65535)throw Error('Pair output premul/capacity')
 const before=sum4(m),after=sum4(out);if(before.some((v,k)=>v!==after[k]))throw Error('Pair conservation')
 return{m:out,ledger:{before,after,openPairs,changedPairs}}
}
export function initializeFixedFine(p:ReturnType<typeof partitionFixedWet>,m=p.coarseM,d=p.coarseD){
 const n=p.size*p.size,fineM=new Uint32Array(n*4),fineD=new Uint32Array(n*4),mask=new Uint8Array(n)
 for(let i=0;i<n;i++){
  mask[i]=Number(p.kind[i]>0);const x=i%p.size,y=Math.floor(i/p.size),owner=Math.floor(y/8)*p.coarseSize+Math.floor(x/8)
  for(let k=0;k<4;k++){if(p.kind[i]===1){fineM[i*4+k]=m[owner*4+k];fineD[i*4+k]=d[owner*4+k]}else if(p.kind[i]===2)fineM[i*4+k]=p.boundary[i*4+k]}
 }
 const coarseTotal=sum4(m).map((v,k)=>v+sum4(d)[k]),expected=coarseTotal.map((v,k)=>64*v+p.rawBoundary[k]),actual=sum4(fineM).map((v,k)=>v+sum4(fineD)[k]);if(expected.some((v,k)=>v!==actual[k]))throw Error('Partition fine ledger')
 return{m:fineM,d:fineD,mask,ledger:{expected,actual,quantizationDelta:p.quantizationDelta.slice(),literal:p.rawLiteral.slice(),qualification:'Fine conservation starts from quantized coarse bulk plus EXACT raw partial wet; coarse encoding deltas explicitly separate.'}}
}
export function encodeFixedFine(p:ReturnType<typeof partitionFixedWet>,m:Uint32Array,d:Uint32Array){
 const out=new Uint8Array(m.length)
 for(let i=0;i<p.kind.length;i++)for(let k=0;k<4;k++){if(!p.kind[i]&&(m[i*4+k]||d[i*4+k]))throw Error('Mobile escaped initial wet domain');const value=m[i*4+k]+d[i*4+k]+p.literal[i*4+k]*257;if(value>65535||value>m[i*4+3]+d[i*4+3]+p.literal[i*4+3]*257)throw Error('Fixed fine output capacity');out[i*4+k]=Math.floor((value+128)/257)}
 return out
}

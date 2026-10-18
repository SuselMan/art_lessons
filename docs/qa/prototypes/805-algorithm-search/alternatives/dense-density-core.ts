import {wetPath} from './dense-remap-core'
/** CPU-only four independent densities D.rgb/M, not premultiplied opacity RGBA. */
export const DENSITY_QUANTUM=8,DENSITY_GLOBAL_LIMIT=0x7fffffff,DENSITY_BYTE1024_MAX=1024*1024*255*DENSITY_QUANTUM
export function mulWeight16(value:number,weight:number){
 if(!Number.isInteger(value)||value<0||value>DENSITY_GLOBAL_LIMIT||!Number.isInteger(weight)||weight<0||weight>65536)throw Error('Density quotient domain')
 return(value>>>16)*weight+(((value&65535)*weight)>>>16)
}
export function splitDensity(value:number,weights:readonly number[]){
 if(weights.length!==4||weights.some(w=>!Number.isInteger(w)||w<0)||weights.reduce((a,b)=>a+b,0)!==65536)throw Error('Density weights')
 let cumulative=0,previous=0;return weights.map(w=>{cumulative+=w;const end=mulWeight16(value,cumulative),p=end-previous;previous=end;return p})
}
export function densityFromBytes(bytes:Uint8Array,size:number){
 if(!Number.isInteger(size)||size<2||size>1024||bytes.length!==size*size*4)throw Error('Density byte input requires2..1024')
 return Uint32Array.from(bytes,c=>c*DENSITY_QUANTUM)
}
export interface DensityInput {size:number;density:Uint32Array;wet:Uint8Array;velocityQ8:Int32Array}
export function densityStep(input:DensityInput){
 const {size,density,wet,velocityQ8}=input,n=size*size
 if(!Number.isInteger(size)||size<2||size>128||density.length!==n*4||wet.length!==n||velocityQ8.length!==n*2)throw Error('CPU density oracle bounded2..128')
 const before=[0,0,0,0];for(let i=0;i<n;i++){for(let k=0;k<4;k++){before[k]+=density[i*4+k];if(before[k]>DENSITY_GLOBAL_LIMIT)throw Error('Density global overflow guard')}for(let k=0;k<2;k++)if(Math.abs(velocityQ8[i*2+k])>4096)throw Error('Density displacement exceeds16')}
 const output=new Uint32Array(density.length)
 for(let i=0;i<n;i++){
  if(!wet[i]){for(let k=0;k<4;k++)output[i*4+k]+=density[i*4+k];continue}
  const x=i%size,y=Math.floor(i/size),px=x*256+velocityQ8[i*2],py=y*256+velocityQ8[i*2+1],bx=Math.floor(px/256),by=Math.floor(py/256),fx=px-bx*256,fy=py-by*256,weights=[(256-fx)*(256-fy),fx*(256-fy),(256-fx)*fy,fx*fy]
  const parts=Array.from({length:4},(_,k)=>splitDensity(density[i*4+k],weights))
  for(let p=0;p<4;p++){
   const tx=Math.max(0,Math.min(size-1,bx+p%2)),ty=Math.max(0,Math.min(size-1,by+(p>>1))),dst=wetPath(wet,size,x,y,tx,ty)?ty*size+tx:i
   for(let k=0;k<4;k++){const sum=output[dst*4+k]+parts[k][p];if(sum>DENSITY_GLOBAL_LIMIT)throw Error('Density receiver overflow guard');output[dst*4+k]=sum}
  }
 }
 const after=[0,0,0,0],max=[0,0,0,0];for(let i=0;i<output.length;i++){after[i%4]+=output[i];max[i%4]=Math.max(max[i%4],output[i])}
 if(before.some((v,k)=>v!==after[k]))throw Error('Density four-channel conservation failure')
 return{density:output,ledger:{before,after,max,quantum:DENSITY_QUANTUM,globalLimit:DENSITY_GLOBAL_LIMIT,displayExcluded:true}}
}

import {DENSITY_GLOBAL_LIMIT,mulWeight16} from './dense-density-core'
import {wetPath} from './dense-remap-core'
export const DENSITY_DIFFUSION_WEIGHTS=Object.freeze([
 Object.freeze([65536,0,0,0,0,0,0,0,0]),
 Object.freeze([55296,2048,2048,2048,2048,512,512,512,512]),
 Object.freeze([24576,8192,8192,8192,8192,2048,2048,2048,2048]),
])
const offsets=[[0,0],[0,-1],[1,0],[0,1],[-1,0],[-1,-1],[1,-1],[1,1],[-1,1]] as const
/** Symmetric real-valued stencil; cumulative integer apportion has measured directional rounding bias. */
export function densityDiffusion(input:{size:number;density:Uint32Array;wet:Uint8Array},level:number){
 const {size,density,wet}=input,n=size*size,weights=DENSITY_DIFFUSION_WEIGHTS[level]
 if(!Number.isInteger(level)||!weights||!Number.isInteger(size)||size<2||size>128||density.length!==n*4||wet.length!==n)throw Error('Invalid bounded density diffusion input')
 const before=[0,0,0,0];for(let i=0;i<density.length;i++){before[i%4]+=density[i];if(before[i%4]>DENSITY_GLOBAL_LIMIT)throw Error('Density diffusion global guard')}
 const output=new Uint32Array(density.length)
 for(let i=0;i<n;i++){
  const x=i%size,y=Math.floor(i/size);let cumulative=0;const previous=[0,0,0,0]
  for(let p=0;p<9;p++){
   cumulative+=weights[p];const [dx,dy]=offsets[p],tx=x+dx,ty=y+dy,inside=tx>=0&&ty>=0&&tx<size&&ty<size,dst=inside&&wetPath(wet,size,x,y,tx,ty)?ty*size+tx:i
   for(let k=0;k<4;k++){const end=mulWeight16(density[i*4+k],cumulative),packet=end-previous[k],v=output[dst*4+k]+packet;previous[k]=end;if(v>DENSITY_GLOBAL_LIMIT)throw Error('Density diffusion receiver overflow');output[dst*4+k]=v}
  }
 }
 const after=[0,0,0,0],max=[0,0,0,0];for(let i=0;i<output.length;i++){after[i%4]+=output[i];max[i%4]=Math.max(max[i%4],output[i])}if(before.some((v,k)=>v!==after[k]))throw Error('Density diffusion conservation')
 return{density:output,ledger:{level,weights:[...weights],before,after,max,globalLimit:DENSITY_GLOBAL_LIMIT}}
}

import {DENSITY_GLOBAL_LIMIT,mulWeight16} from './dense-density-core'
import {DENSITY_DIFFUSION_WEIGHTS} from './dense-density-diffusion'
import {wetPath} from './dense-remap-core'
const offsets=[[0,0],[0,-1],[1,0],[0,1],[-1,0],[-1,-1],[1,-1],[1,1],[-1,1]] as const
/** CPU control: same real stencil, quantized antisymmetric edge flux; no GPU implementation. */
export function densityFlux(input:{size:number;density:Uint32Array;wet:Uint8Array},level:number){
 const {size,density,wet}=input,n=size*size,weights=DENSITY_DIFFUSION_WEIGHTS[level]
 if(!Number.isInteger(level)||!weights||!Number.isInteger(size)||size<2||size>128||density.length!==n*4||wet.length!==n)throw Error('Bounded density flux input')
 const before=[0,0,0,0],minimum=[Infinity,Infinity,Infinity,Infinity],maximum=[0,0,0,0]
 for(let i=0;i<density.length;i++){const k=i%4,v=density[i];before[k]+=v;minimum[k]=Math.min(minimum[k],v);maximum[k]=Math.max(maximum[k],v);if(before[k]>DENSITY_GLOBAL_LIMIT)throw Error('Density flux global overflow')}
 const output=new Uint32Array(density.length)
 for(let i=0;i<n;i++){
  const x=i%size,y=Math.floor(i/size),value=[density[i*4],density[i*4+1],density[i*4+2],density[i*4+3]]
  for(let p=1;p<9;p++){const [dx,dy]=offsets[p],tx=x+dx,ty=y+dy;if(!weights[p]||tx<0||ty<0||tx>=size||ty>=size||!wetPath(wet,size,x,y,tx,ty))continue
   const j=ty*size+tx;for(let k=0;k<4;k++){const difference=density[j*4+k]-density[i*4+k],q=mulWeight16(Math.abs(difference),weights[p]);value[k]+=Math.sign(difference)*q}
  }
  for(let k=0;k<4;k++){if(value[k]<minimum[k]||value[k]>maximum[k])throw Error('Flux maximum principle');output[i*4+k]=value[k]}
 }
 const after=[0,0,0,0];for(let i=0;i<output.length;i++)after[i%4]+=output[i];if(before.some((v,k)=>v!==after[k]))throw Error('Flux four-channel conservation')
 return{density:output,ledger:{level,weights:[...weights],before,after,minimum,maximum,globalLimit:DENSITY_GLOBAL_LIMIT}}
}

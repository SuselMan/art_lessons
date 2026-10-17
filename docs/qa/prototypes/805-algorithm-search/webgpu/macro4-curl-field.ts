import {hashParticle} from './macro2-particles'
export interface CurlFieldConfig {paperStrength?:number;noiseStrength?:number;scalePixels?:number;cfl?:number;mixing?:number}
function noise(x:number,y:number,seed:number){const ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy,s=tx*tx*(3-2*tx),t=ty*ty*(3-2*ty),h=(xx:number,yy:number)=>(hashParticle((Math.imul(xx,374761393)^Math.imul(yy,668265263)^seed)>>>0)/0xffffffff)*2-1;return(1-t)*((1-s)*h(ix,iy)+s*h(ix+1,iy))+t*((1-s)*h(ix,iy+1)+s*h(ix+1,iy+1))}
/** Integer vertex streamfunction + binary global scale preserves discrete divergence exactly. */
export function buildCurlField(environment:Float32Array,n:number,size:number,seed:number,config:CurlFieldConfig={}){
 if(!Number.isInteger(n)||n<4||n>512||environment.length!==n*n*2||!Number.isInteger(size)||size<n||!Number.isInteger(seed))throw Error('Invalid curl field input')
 const paperStrength=config.paperStrength??8,noiseStrength=config.noiseStrength??1,scalePixels=config.scalePixels??128,cfl=config.cfl??.65,mixing=config.mixing??.02
 for(const [name,value,lo,hi]of [['paperStrength',paperStrength,0,64],['noiseStrength',noiseStrength,0,8],['scalePixels',scalePixels,16,512],['cfl',cfl,.01,.9],['mixing',mixing,0,.2]]as const)if(!Number.isFinite(value)||value<lo||value>hi)throw Error('Invalid '+name)
 if(cfl+4*mixing>.95)throw Error('Curl advection+mixing CFL exceeds.95')
 for(let i=0;i<environment.length;i++)if(!Number.isFinite(environment[i])||environment[i]<0||environment[i]>1)throw Error('Invalid environment component')
 const stride=n+1,integral=new Float64Array(stride*stride),potential=new Float64Array(stride*stride),stream=new Int32Array(stride*stride)
 for(let y=0;y<n;y++){let row=0;for(let x=0;x<n;x++){row+=environment[(y*n+x)*2+1];integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row}}
 const box=(x:number,y:number,r:number)=>{const x0=Math.max(0,x-r),y0=Math.max(0,y-r),x1=Math.min(n,x+r),y1=Math.min(n,y+r);return(integral[y1*stride+x1]-integral[y0*stride+x1]-integral[y1*stride+x0]+integral[y0*stride+x0])/((x1-x0)*(y1-y0))}
 const scale=scalePixels*n/size,small=Math.max(1,Math.round(scale/6)),large=Math.max(small+1,Math.round(scale/2));let maxAbs=0,paperEnergy=0,noiseEnergy=0,vertices=0
 for(let y=1;y<n;y++)for(let x=1;x<n;x++){
  if(environment[((y-1)*n+x-1)*2]<=0||environment[((y-1)*n+x)*2]<=0||environment[(y*n+x-1)*2]<=0||environment[(y*n+x)*2]<=0)continue
  const paper=paperStrength*(box(x,y,small)-box(x,y,large)),art=noiseStrength*(noise(x/scale,y/scale,seed)+.25*noise(x/(scale*.5),y/(scale*.5),seed^0x1234567)),v=paper+art;potential[y*stride+x]=v;maxAbs=Math.max(maxAbs,Math.abs(v));paperEnergy+=paper*paper;noiseEnergy+=art*art;vertices++
 }
 if(maxAbs>=1e-6)for(let i=0;i<stream.length;i++)stream[i]=Math.round(potential[i]/maxAbs*32767)
 const rawOutgoing=new Uint32Array(n*n*4);let maxOut=0,maxIntegerDivergence=0
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const i=y*n+x,uL=stream[(y+1)*stride+x]-stream[y*stride+x],uR=stream[(y+1)*stride+x+1]-stream[y*stride+x+1],vT=stream[y*stride+x]-stream[y*stride+x+1],vB=stream[(y+1)*stride+x]-stream[(y+1)*stride+x+1]
  maxIntegerDivergence=Math.max(maxIntegerDivergence,Math.abs(-uL+uR-vT+vB));rawOutgoing[i*4]=Math.max(0,-uL);rawOutgoing[i*4+1]=Math.max(0,uR);rawOutgoing[i*4+2]=Math.max(0,-vT);rawOutgoing[i*4+3]=Math.max(0,vB);maxOut=Math.max(maxOut,rawOutgoing[i*4]+rawOutgoing[i*4+1]+rawOutgoing[i*4+2]+rawOutgoing[i*4+3])
 }
 let denominator=1;while(maxOut/denominator>cfl)denominator*=2
 const outgoing=new Float32Array(n*n*4);for(let i=0;i<outgoing.length;i++)outgoing[i]=rawOutgoing[i]/denominator
 let maxStoredDivergence=0,maxOutgoing=0,blockedLeak=0
 const dirs=[[-1,0],[1,0],[0,-1],[0,1]],op=[1,0,3,2]
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x;let incoming=0,out=0;for(let k=0;k<4;k++){out+=outgoing[i*4+k];const xx=x+dirs[k][0],yy=y+dirs[k][1];if(xx>=0&&yy>=0&&xx<n&&yy<n)incoming+=outgoing[(yy*n+xx)*4+op[k]]}maxOutgoing=Math.max(maxOutgoing,out);maxStoredDivergence=Math.max(maxStoredDivergence,Math.abs(out-incoming));if(environment[i*2]<=0)blockedLeak+=incoming+out}
 if(maxIntegerDivergence!==0||maxStoredDivergence!==0||blockedLeak!==0||maxOutgoing+4*mixing>1)throw Error('Curl divergence/boundary/CFL proof failed')
 return{outgoing,diagnostics:{paperStrength,noiseStrength,scalePixels,cfl,mixing,integerStreamMax:32767,denominator,maxIntegerDivergence,maxStoredDivergence,maxOutgoing,blockedLeak,potentialMaxAbs:maxAbs,rmsPaperPotential:vertices?Math.sqrt(paperEnergy/vertices):0,rmsNoisePotential:vertices?Math.sqrt(noiseEnergy/vertices):0,flatSignalRejected:maxAbs<1e-6}}
}
export function curlStepReference(source:Float64Array,outgoing:Float32Array,environment:Float32Array,n:number,mixing:number){
 const result=new Float64Array(source.length),dirs=[[-1,0],[1,0],[0,-1],[0,1]],op=[1,0,3,2]
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x;if(environment[i*2]<=0){result[i]=source[i];continue}let out=0,value=0;for(let k=0;k<4;k++){out+=outgoing[i*4+k];const xx=x+dirs[k][0],yy=y+dirs[k][1];if(xx<0||yy<0||xx>=n||yy>=n)continue;const j=yy*n+xx;value+=source[j]*outgoing[j*4+op[k]];if(environment[j*2]>0){const a=mixing*Math.min(environment[i*2],environment[j*2]);out+=a;value+=a*source[j]}}result[i]=source[i]*(1-out)+value}return result
}

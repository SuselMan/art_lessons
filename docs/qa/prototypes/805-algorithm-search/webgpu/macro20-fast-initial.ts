import type {Input} from './contract'
import type {initialIntegerDynamic} from './macro8-integer-dynamic'
/** Same validated1024 input domain and exact rounding as old initializer; caller factory retains validateInput. */
export function initialIntegerDynamicFast(input:Input):ReturnType<typeof initialIntegerDynamic>{
 const n=128,N=n*n,state=new Uint32Array(N*12),aux=new Uint32Array(N*4),stationary=new Uint32Array(input.size**2)
 let initialStationaryAlpha=0,initialMobileAlpha=0,frozenWetAlpha=0,frozenCellCount=0,initialWaterCodes=0,initialMobileCodes=0
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const j=y*n+x;let r=0,g=0,b=0,a=0,water=0,paper=0,maxDryA=0,maxWetA=0,dryAlpha=0
  for(let dy=0;dy<8;dy++)for(let dx=0;dx<8;dx++){
   const i=(y*8+dy)*input.size+x*8+dx,k=i*4,R=input.rgba[k],G=input.rgba[k+1],B=input.rgba[k+2],A=input.rgba[k+3],W=input.water[i]
   water+=W;paper+=input.paper[i]
   if(W===0){maxDryA=Math.max(maxDryA,A);dryAlpha+=A;if((R|G|B|A)!==0)stationary[i]=(R|G<<8|B<<16|A<<24)>>>0}
   else{r+=R;g+=G;b+=B;a+=A;maxWetA=Math.max(maxWetA,A)}
  }
  const cr=Math.floor((r*257+32)/64),cg=Math.floor((g*257+32)/64),cb=Math.floor((b*257+32)/64),ca=Math.floor((a*257+32)/64);let cap=65535-maxDryA*257
  initialStationaryAlpha+=dryAlpha
  if(ca>cap){
   frozenCellCount++;frozenWetAlpha+=a;initialStationaryAlpha+=a;cap=65535-Math.max(maxDryA,maxWetA)*257
   // Only exceptional frozen cells need a second scan; dry pixels were already written above.
   for(let dy=0;dy<8;dy++)for(let dx=0;dx<8;dx++){
    const i=(y*8+dy)*input.size+x*8+dx;if(input.water[i]===0)continue;const k=i*4,R=input.rgba[k],G=input.rgba[k+1],B=input.rgba[k+2],A=input.rgba[k+3]
    if((R|G|B|A)!==0)stationary[i]=(R|G<<8|B<<16|A<<24)>>>0
   }
  }else{state[j*12]=cr;state[j*12+1]=cg;state[j*12+2]=cb;state[j*12+3]=ca;initialMobileAlpha+=a;initialMobileCodes+=ca}
  const W=Math.floor((water*257+128)/256),P=Math.floor((paper+32)/64);state[j*12+8]=W;initialWaterCodes+=W;aux[j*4]=cap;aux[j*4+1]=8192+P*64;aux[j*4+2]=P
 }
 return{state,aux,stationary,summary:{initialStationaryAlpha,initialMobileAlpha,frozenWetAlpha,frozenCellCount,initialWaterCodes,initialMobileCodes}}
}

export interface TransportInput {size:number;rgba:Uint8Array;water:Uint8Array;paper:Uint8Array;seed:number;sourceScale:number}
/** No resampling. CPU input is top-left; all GPU data below is GL bottom-up. */
export function prepareInput(input:TransportInput){
 const n=input.size,N=n*n;if(!Number.isInteger(n)||n<1||n>1024||!Number.isSafeInteger(input.seed)||!Number.isFinite(input.sourceScale)||input.sourceScale<=0||input.sourceScale>1||input.rgba.length!==N*4||input.water.length!==N||input.paper.length!==N)throw Error('Invalid common Curtis input')
 const original={...input,rgba:new Uint8Array(input.rgba),water:new Uint8Array(input.water),paper:new Uint8Array(input.paper)},W=new Float32Array(N*4),G=new Float32Array(N*4),domain=new Uint8Array(N),paper=new Uint8Array(N*2),initial=[0,0,0,0];let wetPixels=0,initialWater=0
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x,j=(n-1-y)*n+x,wet=input.water[i]>0;domain[j]=wet?255:0;if(wet){wetPixels++;W[j*4]=input.water[i]/255;W[j*4+2]=1;W[j*4+3]=1;initialWater+=W[j*4]}for(let k=0;k<4;k++){const v=Math.fround(input.rgba[i*4+k]/255);initial[k]+=v;if(wet)G[j*4+k]=v}let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=input.paper[Math.max(0,Math.min(n-1,y+dy))*n+Math.max(0,Math.min(n-1,x+dx))];paper[j*2]=input.paper[i];paper[j*2+1]=Math.round(sum/9)}
 return{original,W,G,domain,paper,initial,initialWater,wetPixels}
}
export interface RawTransport {G:Float32Array;D:Float32Array;W:Float32Array;preClampLastG?:Float32Array;steps:number;rows:'gl-bottom-up';auditExtraRead:boolean;readBytes:number}
/** After ALL primary timers. Display is optical-density, not KM or a bounded carrier. */
export function analyzeTransportRaw(raw:RawTransport,prepared:ReturnType<typeof prepareInput>){
 const input=prepared.original,n=input.size,N=n*n;if(raw.rows!=='gl-bottom-up'||[raw.G,raw.D,raw.W].some(a=>a.length!==N*4))throw Error('Invalid raw float planes')
 const rawSum=new Float32Array(N*4),displayRGBA=new Uint8Array(N*4),totals=[0,0,0,0],minimum={G:Infinity,D:Infinity,W:Infinity,preClampLastG:Infinity};let invalid=0,negative=0,outsideMaterial=0,outsideWater=0,aboveOne=0,negativePreClampChannels=0,surfaceWater=0,absorbedWater=0,cleanWetEntered=0,cleanWetEnteredAtLeastOneCode=0
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x,j=(n-1-y)*n+x,wet=input.water[i]>0;let material=0;surfaceWater+=raw.W[j*4];absorbedWater+=raw.W[j*4+1];for(let k=0;k<4;k++){
  const g=raw.G[j*4+k],d=raw.D[j*4+k],w=raw.W[j*4+k];for(const v of[g,d,w])if(!Number.isFinite(v))invalid++;minimum.G=Math.min(minimum.G,g);minimum.D=Math.min(minimum.D,d);minimum.W=Math.min(minimum.W,w);if(g<0||d<0)negative++;if(!wet&&(g!==0||d!==0))outsideMaterial++;if(!wet&&w!==0)outsideWater++
  const a=raw.preClampLastG?.[j*4+k];if(a!==undefined){minimum.preClampLastG=Math.min(minimum.preClampLastG,a);if(a<0)negativePreClampChannels++;if(!Number.isFinite(a))invalid++}
  const value=wet?g+d:Math.fround(input.rgba[i*4+k]/255);totals[k]+=value;rawSum[i*4+k]=value;if(value>1)aboveOne++;if(k<3)material=Math.max(material,value)
 }
 if(wet&&input.rgba[i*4]===0&&input.rgba[i*4+1]===0&&input.rgba[i*4+2]===0&&input.rgba[i*4+3]===0){if(material>0)cleanWetEntered++;if(material>=1/255)cleanWetEnteredAtLeastOneCode++}
 const bg=250+(input.paper[i]-128)*.025;for(let k=0;k<3;k++){// Zero-step representation control uses exact original code after checking raw roundtrip below.
  const density=raw.steps===0||!wet?input.rgba[i*4+k]/255:raw.G[j*4+k]+raw.D[j*4+k];displayRGBA[i*4+k]=Math.round(Math.min(255,bg*Math.exp(-4*density/input.sourceScale)))}displayRGBA[i*4+3]=255
 }
 if(raw.steps===0)for(let i=0;i<N*4;i++)if(Math.round(rawSum[i]*255)!==input.rgba[i])throw Error('Zero-step raw encoded roundtrip mismatch')
 if(!raw.preClampLastG)minimum.preClampLastG=0
 const ledger={initialTracerRGBA:prepared.initial.slice(),finalTracerRGBA:totals,delta:totals.map((v,k)=>v-prepared.initial[k]),relativeDrift:totals.map((v,k)=>prepared.initial[k]?(v-prepared.initial[k])/prepared.initial[k]:null),initialWater:prepared.initialWater,surfaceWater,absorbedWater,waterRemaining:surfaceWater+absorbedWater,minimum,invalid,negative,outsideMaterial,outsideWater,aboveOneChannels:aboveOne,negativePreClampLastChannels:negativePreClampChannels,cleanWetEntered,cleanWetEnteredAtLeastOneCode,qualification:'Four independent tracers: optical RGB plus nonoptical dose A, NOT KM pigment slots or bounded opacity. Wide raw G+D never clamped. Old gn=max(0,gn) retained; mass drift measured, not certified conserved. Water evaporation active. Preclamp audit recomputes LAST step only, not a history-wide negative detector.'}
 if(invalid||outsideMaterial||outsideWater)throw Error('Raw Curtis fixed-domain/finite guard failed '+JSON.stringify({invalid,outsideMaterial,outsideWater}))
 return{rawSum,rows:'top-left' as const,displayRGBA,ledger}
}

import {createSmallPositivePairedGpu,SMALL_POSITIVE_BYTES,positiveGpuInput} from './SmallPositivePairedGpu.mjs';
import {actual128DonorFractions,liftActual128Fractions,applyLiftedPairedDriver} from './Actual128PairedDriverAdapter.mjs';
const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),v=>v.toString(16).padStart(2,'0')).join('');
/** One exact captured-input moment gate. Caller owns standalone gl + known-idle lifecycle. */
export async function runActualPositivePairedGpu(gl,{enabled=false,evidenceBase=new URL('./actual-paired-evidence/',import.meta.url).href}={}){
 if(!enabled)return null;const summary=await(await fetch(evidenceBase+'summary.json')).json(),raw={};
 for(const[k,r]of Object.entries(summary.raw)){const response=await fetch(evidenceBase+r.path);if(!response.ok)throw Error('Actual raw HTTP '+k);const b=await response.arrayBuffer();if(b.byteLength!==r.bytes||await hash(b)!==r.sha)throw Error('Actual raw SHA/size '+k);raw[k]=k==='oldP'?new Float32Array(b):new Uint8Array(b);}
 if(await hash(new TextEncoder().encode(summary.packedSource))!==summary.passport.packedSha)throw Error('Actual packed source SHA');
 const p=summary.passport,n=16384,source=new Float64Array(n*8),wet=new Uint8Array(n),fluid=new Float64Array(n);
 for(let i=0;i<n;i++){for(let c=0;c<4;c++){source[i*8+c]=raw.sourceP[i*4+c]/255;source[i*8+4+c]=raw.sourceC[i*4+c]/255;}wet[i]=raw.fluid[i*4+3]>0?1:0;}
 for(let y=0;y<16;y++)for(let x=0;x<16;x++)fluid[(p.origin[1]/8+y)*128+p.origin[0]/8+x]=raw.fluid[((y*8+4)*128+x*8+4)*4+3]/255;
 const driver=actual128DonorFractions({pressure:Float64Array.from(raw.pressure,v=>v/255),path:Float64Array.from(raw.path,v=>v/255),fluid,oldP:Float64Array.from(raw.oldP),epoch:p.epoch,passStep:p.passStep,passStride:p.passStride,options:summary.driverOptions}),lift=liftActual128Fractions({driver,origin:p.origin,side:128,highWet:wet}),prepared=positiveGpuInput(source,lift);
 const roundedSource=new Float64Array(source.length);for(let i=0;i<n;i++)for(let c=0;c<4;c++){roundedSource[i*8+c]=prepared.p[i*4+c];roundedSource[i*8+4+c]=prepared.c[i*4+c];}
 const expected=applyLiftedPairedDriver({source:roundedSource,side:128,lift:{...lift,fractions:prepared.fractions}}).moments;let gpu;
 try{gpu=createSmallPositivePairedGpu(gl,{enabled:true,budgetBytes:SMALL_POSITIVE_BYTES});gpu.initialize({source,lift});const initial=gpu.readPair();let t0Changed=0;for(let i=0;i<65536;i++)t0Changed+=(initial.p[i]!==prepared.p[i])+(initial.c[i]!==prepared.c[i]);gpu.step();const actual=gpu.readPair(),mass=[Array(8).fill(0),Array(8).fill(0)];let maxAbs=0,nonfinite=0,negative=0,changed=0;
  for(let i=0;i<n;i++)for(let c=0;c<8;c++){const v=(c<4?actual.p:actual.c)[i*4+c%4];mass[0][c]+=roundedSource[i*8+c];mass[1][c]+=v;maxAbs=Math.max(maxAbs,Math.abs(v-expected[i*8+c]));nonfinite+=!Number.isFinite(v);negative+=v<0;changed+=v!==roundedSource[i*8+c];}
  const massErrors=mass[0].map((v,c)=>Math.abs(v-mass[1][c]));return{scope:'ONE actual captured-input GPU paired moment step; no animation/material acceptance',inputPassport:p,inputLifecycleFail:summary.diagnosticLifecyclePass===false,bytes:gpu.bytes,t0Changed,maxAbsVsCpuRoundedInputs:maxAbs,nonfinite,negative,changedValues:changed,massBefore:mass[0],massAfter:mass[1],massErrors,hop:lift.hop,valid:t0Changed===0&&maxAbs<1e-6&&nonfinite===0&&negative===0&&changed>0&&massErrors.every((e,c)=>e<1e-6*Math.max(1,mass[0][c])),limitations:gpu.limitations};
 }finally{if(gpu){if(!gl.isContextLost())gl.finish();gpu.disposeAfterKnownIdle();}}
}

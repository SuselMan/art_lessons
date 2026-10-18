import {quarterPairs} from './fixed-wet-b-lite'
/** Reconstruction-only smoothing: no bilinear masked delta. Each step transfers on original-wet faces. */
export function smoothFixedWetInitialization(m:Uint32Array,d:Uint32Array,wet:Uint8Array,size:number,cycles:number){
 if(!Number.isInteger(cycles)||cycles<0||cycles>4)throw Error('Reconstruction cycles0..4')
 let mobile=m.slice(),deposit=d.slice();const sum=(a:Uint32Array)=>{const r=[0,0,0,0];for(let i=0;i<a.length;i++)r[i%4]+=a[i];return r}
 const beforeM=sum(m),beforeD=sum(d)
 for(let cycle=0;cycle<cycles;cycle++)for(let phase=0;phase<4;phase++){
  // Each pass uses the OTHER carrier as occupied capacity. Never remobilize deposited material.
  mobile=quarterPairs(mobile,deposit,wet,size,phase).m
  deposit=quarterPairs(deposit,mobile,wet,size,phase).m
 }
 const afterM=sum(mobile),afterD=sum(deposit);if(beforeM.some((v,k)=>v!==afterM[k])||beforeD.some((v,k)=>v!==afterD[k]))throw Error('Reconstruction ledger')
 for(let i=0;i<wet.length;i++)if(!wet[i])for(let k=0;k<4;k++)if(mobile[i*4+k]||deposit[i*4+k])throw Error('Dry reconstruction material')
 return{m:mobile,d:deposit,ledger:{beforeM,beforeD,afterM,afterD,qualification:'Wet-only symmetric pair reconstruction preserves M4 and D4 separately. New initialization operator, NOT old halfpixel BLR.'}}
}

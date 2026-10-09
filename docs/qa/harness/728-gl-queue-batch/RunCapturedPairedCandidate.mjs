import {actual128DonorFractions,liftActual128Fractions,applyLiftedPairedDriver} from './Actual128PairedDriverAdapter.mjs';
import {hashSmallPairedSnapshot} from './CaptureSmallPairedDriver.mjs';
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
/** Diagnostic CPU result only; promotion means evidence retention, never engine publication. */
export async function runCapturedPairedCandidate(snapshot,{sourceHead,stage,subtle,currentPassport}={}){
 if(stage!=='before-carry'||!sourceHead||!snapshot?.passport||snapshot.passport.ownerSequence!==2)throw Error('Exact before-carry source passport required');
 const p=snapshot.passport;
 if(!snapshot.highWet||snapshot.highWet.length!==p.side*p.side)throw Error('Missing high wet support');
 if(snapshot.driver?.epoch!==p.epoch||snapshot.driver?.passStride!==p.passStride||snapshot.driver?.passStep!==p.passStep)throw Error('Driver epoch/stride/step mismatch');
 const identity=snapshot.source.slice(),driver=actual128DonorFractions(snapshot.driver),lift=liftActual128Fractions({driver,origin:p.origin,side:p.side,highWet:snapshot.highWet});
 const result=applyLiftedPairedDriver({source:snapshot.source,side:p.side,lift});
 const masses=[new Array(8).fill(0),new Array(8).fill(0)];let changed=0;
 for(let i=0;i<identity.length;i++){if(snapshot.source[i]!==identity[i])throw Error('Source mutated');masses[0][i%8]+=identity[i];masses[1][i%8]+=result.moments[i];if(identity[i]!==result.moments[i])changed++;}
 const errors=masses[0].map((m,c)=>Math.abs(m-masses[1][c]));if(errors.some((e,c)=>e>1e-10*Math.max(1,masses[0][c])))throw Error('Paired mass gate failed');
 const passport={...await hashSmallPairedSnapshot(snapshot,subtle),sourceHead,stage};
 // Async hashing must not allow stale state to be promoted.
 const current=currentPassport?.();if(!current||['ownerSequence','epoch','passStep','passStride','packedSha','paperSha'].some(k=>current[k]!==p[k])||current.sourceHead!==sourceHead||current.stage!==stage)throw Error('Stale snapshot after hashing');
 if(Object.keys(passport.rawSha256).length!==6||!Object.values(passport.rawSha256).every(sha))throw Error('Incomplete raw hash passport');
 return{result,passport,promotion:{allowed:true,kind:'bounded-diagnostic-evidence',bytes:p.bytes,massErrors:errors,changedValues:changed},limitations:snapshot.limitations};
}

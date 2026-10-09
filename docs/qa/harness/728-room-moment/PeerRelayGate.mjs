export function peerRelayGate(remote){
 if(remote.length!==3||remote.map(o=>o.type).join(',')!=='stroke,operation_undo,operation_redo'||remote.some((o,i)=>!Number.isFinite(o.seq)||(i>0&&o.seq<=remote[i-1].seq)))throw Error('Actual server remote seq/FIFO relay mismatch');
 if(remote.some(o=>!o.lease||!o.active))return{comparable:false,reason:'INCOMPARABLE: lease naturally completed before peer relay'};
 return{comparable:true};
}
export function protectManualRoom(created,protectedRoom){if(!protectedRoom||!created||created===protectedRoom)throw Error('New own QA room required; manual room protected')}

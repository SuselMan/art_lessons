/** New explicitly split proof: first source under lease; later controls under the same held input/queue. */
export function preparedPeerRelayGate(rows,gesture){
 if(!gesture||rows.length!==3||rows.map(o=>o.type).join(',')!=='stroke,operation_undo,operation_redo'||rows.some((o,i)=>!Number.isFinite(o.seq)||(i>0&&o.seq<=rows[i-1].seq)))throw Error('Prepared peer server sequence proof required');
 if(!rows[0].lease)return{comparable:false,reason:'First peer source did not overlap actual lease'};
 if(rows.some(o=>!o.active||o.gesture!==gesture||!o.queuedAfter?.includes(rows[0].id)))throw Error('Held gesture/queued peer prefix ownership changed');
 if(rows.slice(1).some(o=>o.target!==rows[0].id))throw Error('Peer controls lost source target');
 return{comparable:true,scope:'First peer source received under actual lease; exact-target controls retained behind its queue under the same live input',naturalLeaseRetirement:rows.slice(1).some(o=>!o.lease)};
}

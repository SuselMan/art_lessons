/** Strict admission/observation gate, no device or clock side effects. */
export function glTiming400Gate({stats,records,expected,userId,layerId,pendingBeforeSecond}) {
 const fail=reason=>({valid:false,reason});
 if(!stats||stats.active||stats.capacity!==1024||stats.dropped!==0||stats.observerErrors!==0||stats.recorded!==records?.length)return fail('Incomplete timing ring');
 if(!pendingBeforeSecond||expected?.length!==2||!userId||!layerId)return fail('Missing pending/owned input');
 const inputs=[];
 for(let i=0;i<2;i++){
  const rows=records.filter(r=>r.input===i+1&&r.scope==='down'),own=rows.filter(r=>r.strokeId===expected[i].strokeId);
  if(rows.some(r=>r.userId!==userId||r.layerId!==layerId||!Number.isFinite(r.start)||!Number.isFinite(r.end)||r.end<r.start))return fail('Owner/timing mismatch');
  const only=phase=>{const found=own.filter(r=>r.phase===phase);return found.length===1?found[0]:null};
  const down=only('input-down-through-display'),pigment=only('first-pigment-submit'),display=only('display-submit');
  if(!down||!pigment||!display||pigment.start<down.start||pigment.end>display.end||display.end>down.end)return fail('Missing positive owned source/display timeline');
  const admission=rows.filter(r=>r.phase==='admission-lease');
  if(admission.length!==1||![0,1].includes(admission[0].value))return fail('Missing actual lease decision');
  const drains=rows.filter(r=>r.phase==='admission-complete-settle');
  inputs.push({input:i+1,strokeId:expected[i].strokeId,leaseAccepted:admission[0].value===1,drainCount:drains.length,downMs:down.end-down.start,pigmentSubmitMs:pigment.end-down.start,displaySubmitMs:display.end-down.start});
 }
 if(inputs[1].leaseAccepted&&inputs[1].drainCount!==0)return fail('Lease/drain contradiction');
 return {valid:true,inputs,classification:inputs[1].leaseAccepted?'lease-accepted':'fallback-drain',scope:'CPU synchronous DOWN submission, not GPU/physical pixels'};
}

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

function coveredMs(intervals) {
 const sorted=intervals.filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);let covered=0,end=-Infinity;
 for(const[a,b]of sorted){if(b<=end)continue;covered+=b-Math.max(a,end);end=b}return covered;
}
/** Attribute only observed CPU intervals; nested spans are not added twice. */
export function glUpTimingGate({records,expected,userId,layerId,betweenGesture,beforeSecondWet}) {
 const fail=reason=>({valid:false,reason});
 if(!betweenGesture||!Number.isFinite(betweenGesture.gapFromFirstUpReturnMs)||betweenGesture.gapFromFirstUpReturnMs<0||betweenGesture.secondDownBegin-betweenGesture.firstUpReturn!==betweenGesture.gapFromFirstUpReturnMs)return fail('Actual gap endpoints missing');
 if(!beforeSecondWet||beforeSecondWet.layerId!==layerId||!Number.isFinite(beforeSecondWet.at)||!Number.isFinite(beforeSecondWet.center)||beforeSecondWet.center<0||beforeSecondWet.center>1||typeof beforeSecondWet.nearForEligibility!=='boolean'||typeof beforeSecondWet.anyWet!=='boolean')return fail('Actual center/eligibility wet sample missing');
 const inputs=[];
 for(let i=0;i<2;i++){
  const rows=records.filter(r=>r.input===i+1&&r.scope==='up');
  if(rows.some(r=>r.strokeId!==expected[i].strokeId||r.userId!==userId||r.layerId!==layerId||!Number.isFinite(r.start)||!Number.isFinite(r.end)||r.end<r.start))return fail('UP owner/timing mismatch');
  const total=rows.filter(r=>r.phase==='input-up-total');
  if(total.length!==1)return fail('Actual UP total missing');
  const bound=total[0],children=rows.filter(r=>r!==bound);
  if(children.some(r=>r.start<bound.start||r.end>bound.end))return fail('UP child outside actual total');
  for(const phase of ['up-tail-geometry','up-finish-total','up-diffusion-preparation','up-new-solver-start-and-stitch','display-submit','up-pack-dabs','up-log-append','up-local-callback','up-pending-commit','up-settle-layers'])if(!children.some(r=>r.phase===phase))return fail('UP phase missing: '+phase);
  const phaseMs={};for(const r of children)(phaseMs[r.phase]??=[]).push([r.start,r.end]);
  for(const name of Object.keys(phaseMs))phaseMs[name]=coveredMs(phaseMs[name]);
  const totalMs=bound.end-bound.start,observedUnionMs=coveredMs(children.map(r=>[r.start,r.end]));
  inputs.push({input:i+1,strokeId:expected[i].strokeId,totalMs,phaseMs,observedUnionMs,unknownExclusiveMs:Math.max(0,totalMs-observedUnionMs)});
 }
 return{valid:true,inputs,betweenGesture,beforeSecondWet,scope:'CPU elapsed interval union, nested phases overlap; no GPU attribution'};
}

/** Identical input cohort. No idle between first UP and second DOWN. */
export const mixedLeaseInput = Object.freeze([
 {preset:'normal:100:0:PB29:round', points:[{x:40,y:64,timeStamp:10},{x:64,y:64,timeStamp:26},{x:88,y:64,timeStamp:42}]},
 {preset:'normal:100:100:PB29:round', points:[{x:64,y:64,timeStamp:58},{x:76,y:64,timeStamp:74},{x:88,y:64,timeStamp:90}]},
]);
export function driveMixedLeaseInput(e, {enabled, clock=()=>{}, afterSecondDown=()=>{}}){
 if(typeof enabled!=='boolean'||e._wcJoinedTouch!==true||e._wcJoinedTouchMixed||e._wcJoinedFinishDeferred||e._wcAsyncFinish||e._wcMaterialPresentation||typeof e._wcJoinedTouchSnapshotLease!=='boolean')throw Error('Strict joined-only model and explicit arm required');
 if(e._settle||e._wash)throw Error('Fresh wash required');
 e._wcJoinedTouchSnapshotLease=enabled;e.setTool('watercolor');e.setSize(24);e.setColor([.3,.15,.55]);
 const original=e._completeSettle;let phase='',downDrains=0,upDrains=0,leaseAdmissions=0,sourceCommands=0,predecessorPending=false;
 e._completeSettle=function(...args){if(phase==='second-down')downDrains++;if(phase==='second-up')upDrains++;return original.apply(this,args)};
 const sample=p=>({pressure:1,tiltX:0,tiltY:0,speed:0,pointerType:'pen',...p});
 const effectiveInputs=mixedLeaseInput.map(stroke=>({preset:stroke.preset,size:24,color:[.3,.15,.55],samples:stroke.points.map(sample)}));
 try{
  for(let i=0;i<mixedLeaseInput.length;i++){
   const stroke=mixedLeaseInput[i];e.setPencil(stroke.preset);const [first,...rest]=stroke.points;
   const old=i===1?e._settle:null;if(i===1){predecessorPending=!!old;if(!old)throw Error('Second DOWN must precede canonical idle')}
   phase=i===1?'second-down':'first-down';clock(first.timeStamp);e._onStart(sample(first));
   if(i===1){leaseAdmissions=Number(e._wcJoinedTouchLease===old);sourceCommands=old.scratch.runningSourceCommands.length;afterSecondDown({old,leaseAdmissions,downDrains,sourceCommands})}
   phase='move';for(const p of rest){clock(p.timeStamp);e._onMove(sample(p))}
   phase=i===1?'second-up':'first-up';clock(stroke.points.at(-1).timeStamp+1);e._onEnd(sample(stroke.points.at(-1)));
  }
  if(enabled?leaseAdmissions!==1||downDrains!==0||sourceCommands<1:leaseAdmissions!==0||downDrains<1)throw Error('Actual overlapping admission proof failed');
  return{enabled,predecessorPending,leaseAdmissions,downDrains,upDrains,sourceCommands,effectiveInputs,scope:'Real private pointer pipeline; synchronous fixed input, not physical pen latency'};
 }finally{e._completeSettle=original}
}
/** Compare random IDs by a bijection, preserving all repeated references and other fields. */
export function normalizedMixedHistory(ops){
 const ids=new Map();const id=value=>{if(typeof value!=='string'||!value)throw Error('Invalid history ID');if(!ids.has(value))ids.set(value,'id'+ids.size);return ids.get(value)};
 return ops.map(op=>{const out=structuredClone(op);for(const key of ['id','strokeId','washId'])if(out[key]!==undefined)out[key]=id(out[key]);return out});
}

/** Presentation-only finite schedule. No canonical field or clock is consumed. */
export class PreviewSettlingBudget {
 constructor({durationMs, smooth, puddle, fine, core, settleStep}) {
  if(!Number.isFinite(durationMs)||durationMs<=0||![core,settleStep].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid settling budget');
  this.stages=[...smooth.map(step=>({step,land:core,smooth:true})),...puddle.map(step=>({step,land:settleStep})),...fine.map(step=>({step,land:0}))];
  if(!this.stages.length)throw Error('Empty settling budget');
  // Core is landed once, after the last smoothing step.
  this.stages=this.stages.map((s,i)=>({...s,land:s.smooth?(i===smooth.length-1?core:0):s.land}));
  this.durationMs=durationMs;this.elapsed=0;this.cursor=0;this.mobile=1;this.fixed=0;this.previous=null;this.retired=false;
 }
 tick(now,{penActive=false,frozen=false,lost=false}={}) {
  if(!Number.isFinite(now))throw Error('Finite timestamp required');
  if(this.retired)return null;
  if(lost){this.retired=true;return null}
  const dt=this.previous===null?0:Math.max(0,now-this.previous);this.previous=this.previous===null?now:Math.max(this.previous,now);
  if(penActive||frozen||this.cursor===this.stages.length)return null;
  // No catch-up burst: at most one physical operation is admitted per tick.
  this.elapsed=Math.min(this.durationMs,this.elapsed+dt);
  if(this.elapsed<(this.cursor+1)*this.durationMs/this.stages.length)return null;
  const index=this.cursor++,stage=this.stages[index],landWeight=this.mobile*stage.land;
  this.fixed+=landWeight;this.mobile-=landWeight;
  return Object.freeze({index,step:stage.step,landWeight,mobileWeight:this.mobile,fixedWeight:this.fixed,done:this.cursor===this.stages.length});
 }
 retire(){this.retired=true}
}
export const PREVIEW_FIXED_PAIR_BYTES=4*128*128*16;
export const PREVIEW_FIXED_THREE_OWNER_BYTES=3*PREVIEW_FIXED_PAIR_BYTES;
/** Sum paired moment channels before optics; CPU reference, not a GPU parity claim. */
export function addPairedSlice(fixedP,fixedC,movingP,movingC,weight){
 if(!(weight>=0&&weight<=1)||![fixedC,movingP,movingC].every(a=>a.length===fixedP.length))throw Error('Paired slice shape/weight mismatch');
 const p=new Float64Array(fixedP.length),c=new Float64Array(fixedP.length);
 for(let i=0;i<p.length;i++){p[i]=fixedP[i]+weight*movingP[i];c[i]=fixedC[i]+weight*movingC[i]}
 return {p,c};
}

/** Flat-height, fully wet unbounded reference ONLY. No runtime or solver changes. */
export function diffuseWorldSecondMoment({radius,knight},scale,d){
 if(!(Number.isFinite(radius)&&radius>0&&Number.isFinite(scale)&&scale>0&&Number.isFinite(d)&&d>=0&&d<=.125))throw Error('Finite stable diffusion reference required');
 const actualRadius=Math.max(1,Math.round(radius/scale))*scale;
 return d*(knight?40:12)*actualRadius**2;
}
export function settledWorldSecondMoment({smooth,puddle,fine,core,settleStep,scale,d}){
 if(!(core>=0&&core<=1&&settleStep>=0&&settleStep<=1))throw Error('Settling fractions required');
 const delta=s=>diffuseWorldSecondMoment(s,scale,d);let moment=smooth.reduce((n,s)=>n+delta(s),0),mobile=1-core;
 for(const s of puddle){moment+=mobile*delta(s);mobile*=1-settleStep}
 moment+=mobile*fine.reduce((n,s)=>n+delta(s),0);
 return{moment,mobileTail:mobile,coreFraction:core,stepCount:smooth.length+puddle.length+fine.length};
}
/** Exact convex fractional update of a fixed-gate linear Markov operator.
 * Hardware/float rounding and material gates still require separate proof. */
export function fractionalDiffusionBudget(targetWorldMoment,fullStepWorldMoment){
 if(!(Number.isFinite(targetWorldMoment)&&targetWorldMoment>=0&&Number.isFinite(fullStepWorldMoment)&&fullStepWorldMoment>0))throw Error('Finite transport budget required');
 const fraction=targetWorldMoment/fullStepWorldMoment;if(fraction>1)throw Error('Target requires more than one full step');return fraction;
}

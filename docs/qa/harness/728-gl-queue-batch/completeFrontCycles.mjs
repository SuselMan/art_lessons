/** Diagnostic only: keep complete dyadic cycles and material writes from tick one. */
export function completeFrontCycles(strides, requestedFrontSteps, cap=32, maxCarry=40){
 if(!Array.isArray(strides)||!strides.length||strides.at(-1)!==1||strides.some(s=>![1,2,4,8,16].includes(s)))throw Error('Complete supported cycle required');
 if(!Number.isInteger(requestedFrontSteps)||requestedFrontSteps<1||!Number.isInteger(cap)||cap<1||cap>32||!Number.isInteger(maxCarry)||maxCarry<1||maxCarry>40)throw Error('Explicit bounded front/carry limits');
 const frontSteps=Math.min(requestedFrontSteps,cap), cycles=Math.ceil(frontSteps/strides.length), count=cycles*strides.length;
 if(count>maxCarry)throw Error('Complete cycle exceeds carry budget');
 return Object.freeze({frontSteps,strides:Object.freeze(Array.from({length:cycles},()=>strides).flat()),requestedFrontSteps,clamped:requestedFrontSteps>cap});
}

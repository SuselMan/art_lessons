/** OFF visual-only axis transport; not the production paired-colour path policy. */
export function previewMultiscaleCarry({passes,seed,pressure,water,pathLease,input,stride}){
 if(![1,2,4,8,16].includes(stride))throw Error('Bounded dyadic stride');
 const{targets:t,options:o,source:s}=input,[first,second]=pathLease.fields;
 const inputs=[pressure,water,t.oldP,t.oldC,t.fixedP,s.solventLoad],outputs=[first,second,t.outP,t.outC];
 if(new Set([...inputs,...outputs].map(f=>f.texture)).size!==inputs.length+outputs.length)throw Error('Multiscale input/output alias');
 if([pressure,water,...outputs,t.oldP,t.oldC,t.fixedP].some(f=>f.width!==128||f.height!==128)||![o.budgetPx,o.costMax,o.rate,o.pow,o.travel,o.effectiveWet,o.wetLo,o.wetHi].every(Number.isFinite)||o.rate<0||o.rate>1||o.costMax<=0||o.budgetPx<=1.5||o.wetHi<=o.wetLo)throw Error('Multiscale dimensions/options');
 const band=(o.budgetPx-1.5)/o.costMax;seed.draw(first,pressure,water,band);let mask=first,next=second,reductions=0;
 for(let distance=1;distance<stride;distance*=2){passes.costDomainStep(next,mask,[0,0,128,128],band,distance);[mask,next]=[next,mask];reductions++}
 const opts={path:mask,d:pressure,e:s.solventLoad,dir:[stride,stride],band:[band,o.effectiveWet],size:[o.pow,o.costMax],origin:[stride,o.travel],tau:[o.wetLo,o.wetHi,1]};
 passes.fieldOp(t.outC,t.oldC,t.fixedP,16,o.rate,{...opts,c:t.oldP});passes.fieldOp(t.outP,t.oldP,t.fixedP,15,o.rate,opts);
 return{p:t.outP,c:t.outC,draws:3+reductions,mask,stride};
}

import{previewCarryContract}from'./PreviewCarryContract.mjs';
/** OFF visual primitive. Parameters must be captured/source-derived explicitly.
 * No claim of canonical pressure equality: final late-bound base may differ. */
export class PreviewFrontCarryGlPort {
 constructor(passes,{world,paperWidth,paperHeight,maxFrontSteps}){
  if(!world||world.width!==1024||world.height!==1024||!(paperWidth>0&&paperHeight>0)||!Number.isInteger(maxFrontSteps)||maxFrontSteps<1||maxFrontSteps>32)throw Error('Bounded visual pressure world/budget');
  this.passes=passes;this.world=Object.freeze({...world});this.paperWidth=paperWidth;this.paperHeight=paperHeight;this.maxFrontSteps=maxFrontSteps;this.frontSteps=0;this.pressureSide=0;this.seeded=false;
 }
 seed(input){const c=previewCarryContract(input);if(this.seeded)throw Error('Pressure already seeded');const {targets:t,options:o,source:s}=c;
  // Production mode10 needs standing B from ACTUAL coverage, not support-only
  // transport domain128. Normalized UV reads immutable high-resolution coverage.
  this.passes.fieldOp(t.pressure0,t.oldP,s.coverage,10,.003,{band:[1/o.costMax,o.standing],size:[(o.budgetPx-1)/o.costMax,0]});this.seeded=true;return c;
 }
 frontStep(input,domain){const c=previewCarryContract(input);if(!this.seeded||this.frontSteps>=this.maxFrontSteps)throw Error('Pressure budget exhausted/not seeded');if(domain.width!==128||domain.height!==128)throw Error('Pressure domain dimensions');if(domain.texture===c.targets.pressure0.texture||domain.texture===c.targets.pressure1.texture)throw Error('Pressure domain feedback');const {targets:t,options:o}=c,from=t[`pressure${this.pressureSide}`],to=t[`pressure${1-this.pressureSide}`];
  this.passes.waterFrontStep({w:128,h:128,coverage:domain},this.world.x,this.world.y,o.dryCost,from,to,o.costMax,o.climb,o.floor,1,8);this.pressureSide=1-this.pressureSide;this.frontSteps++;return to;
 }
 carry(input){const c=previewCarryContract(input);if(!this.seeded||this.frontSteps===0)throw Error('Carry requires actual evolved pressure');const {targets:t,options:o,source:s}=c,pressure=t[`pressure${this.pressureSide}`];
  const opts={d:pressure,e:s.solventLoad,dir:[1,1],band:[(o.budgetPx-1.5)/o.costMax,o.effectiveWet],size:[o.pow,o.costMax],origin:[1,o.travel],tau:[o.wetLo,o.wetHi,1]};if(!Number.isFinite(o.wetLo)||!Number.isFinite(o.wetHi)||o.wetHi<=o.wetLo)throw Error('Explicit plateau wet interval');
  // Both outputs use SAME OLD deposit density and SAME fixed deposit.
  this.passes.fieldOp(t.outC,t.oldC,t.fixedP,16,o.rate,{...opts,c:t.oldP});
  this.passes.fieldOp(t.outP,t.oldP,t.fixedP,15,o.rate,opts);
  return Object.freeze({p:t.outP,c:t.outC,pressure,frontSteps:this.frontSteps});
 }
}

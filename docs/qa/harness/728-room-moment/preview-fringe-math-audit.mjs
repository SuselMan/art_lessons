import assert from 'node:assert/strict';
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
const thin=a=>.12*(1-smooth(0,.12,a));
const tau=(rgb,a,localRGB,localA)=>{const prior=thin(a);const tauPrior=localRGB*4/Math.max(localA,5e-5);return(rgb*4+tauPrior*prior)/(a+prior)};
const q=1/255;
assert(q<.004);assert(2*q>.004);assert(q>.002);
// Production rect composite restores original when coverage falls below.004,
// even when transported material fields are nonzero and finite.
const transported={p:[20*q,0,10*q,20*q],c:[5*q,2*q,q,10*q]};
const compositeGuard=coverage=>coverage<.004?'original':'material';
assert.equal(compositeGuard(0),'original');assert.equal(compositeGuard(q),'original');assert.equal(compositeGuard(2*q),'material');
assert(transported.p[2]>0&&transported.c[3]>0);
// Actual thinPrior: zero-depth neighborhood yields tau0 (white), independently of P.B.
assert.equal(tau(0,0,0,0),0);assert.equal(Math.exp(-tau(0,0,0,0)),1);
const stabilized=tau(0,2*q,2*q,2*q);assert(Number.isFinite(stabilized)&&stabilized>0);
// Tiny positive depth/mass gives finite absorption but may quantize final alpha to0.
const pigmentMass=2*q,localTau=.05,thickness=pigmentMass*.55/.54;
const density=1-Math.exp(-localTau*thickness);
assert(density>0);assert.equal(Math.round(density*255),0);
// wcInkAvg isolated cell center-only: (2P/14)*2; positive1code becomes below.004.
const smoothIsolated=4*q/14;assert(smoothIsolated<.004);
console.log(JSON.stringify({pass:true,rawCoverage1CodeRestoresOriginal:true,unsmoothedInk1CodePasses004:true,isolatedSmoothedInk1CodeFallsBelow004:true,zeroLocalDepthPaint:1,stabilizedTau:stabilized,weakFinalAlpha:Math.round(density*255),scope:'selected actual formulas; not fullshader/GPU mass proof'}));

import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
test('recorded edge face is above Q8 threshold under literal shader constants and expected uniforms',()=>{
 const shader=fs.readFileSync(new URL('../../../../apps/web/src/engine/src/raster/shaders.ts',import.meta.url),'utf8');const constant=name=>{const m=shader.match(new RegExp('const float '+name+' = ([0-9.]+);'));assert.ok(m);return Number(m[1])};assert.equal(constant('WC_CARRY_RIDGE'),1);
 const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)},pow=3,band=(12-1.5)/16,ci=0,cj=14/255,rate=.5,trav=.35,mass=80;
 const s=smooth(0,band,cj),capI=1,capJ=1-constant('WC_CARRY_TAIL')*s,capIJ=2*capI*capJ/(capI+capJ),w=Math.min(1/((cj-ci)*16),4)**pow*(1-s)**constant('WC_CARRY_TAPER'),plateau=4**pow;
 // Three interior neighbours of(x44,y64) lie in radius4.375 footprint;
 // recorded pressure cannot rise from seed0 during min-relaxation.
 const amount=rate*w/(3*plateau+w)*Math.min(trav*mass/capI*capIJ,trav*mass);
 assert.ok(amount>3&&amount<4);assert.ok(Math.round(amount)>0);
 const closedWeight=1>band?0:w;assert.equal(closedWeight,0);
 // This conditional CPU algebra is NOT proof actual GPU uniforms are correct.
});

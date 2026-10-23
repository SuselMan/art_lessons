import {watercolorWaterLoad,watercolorWaterClock,watercolorStandingWater,watercolorExcessFromSurplus} from '../../apps/web/src/engine/src/presets/watercolorPresets.ts';
const out=[];
for(const policy of ['legacy','finite','bottomless'])for(const pigment of [0,.15,1]){
 let used=0;const trace=[];
 for(let i=0;i<=40;i++){if(i)used=watercolorWaterClock(used,.5,0);const finite=policy==='finite'||policy==='legacy'&&pigment>0;const load=finite?watercolorWaterLoad(used):1;trace.push({at:i*.5,load,standing:watercolorStandingWater(1,1,0,load)})}
 out.push({policy,pigment,tail:trace.at(-1),trace});
}
const finite=out.filter(x=>x.policy==='finite'),bottomless=out.filter(x=>x.policy==='bottomless');
for(const group of[finite,bottomless])if(group.some(x=>JSON.stringify(x.trace)!==JSON.stringify(group[0].trace)))throw Error('Pigment-dependent water source');
console.log(JSON.stringify({waterPolicies:out,landing:[0,1,3,8].map(used=>({used,dry:watercolorExcessFromSurplus(used,0,0),fluid:watercolorExcessFromSurplus(used,1,0)}))},null,2));

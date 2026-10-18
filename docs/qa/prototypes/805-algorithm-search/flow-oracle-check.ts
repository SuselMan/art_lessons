import {createFlowFixture} from './flow-fixtures'
import {flowMetrics,dynamicMetrics} from './flow-metrics'
const assert=(v:unknown,m:string)=>{if(!v)throw Error(m)}
const drop=createFlowFixture('flow-pool-drop')
const unchanged=flowMetrics('flow-pool-drop',drop,drop.rgba)!
assert(unchanged.massBeyond25px===0,'Identity must not count as flow')
const cosmetic=drop.rgba.slice();for(let p=0;p<cosmetic.length;p+=4)if(cosmetic[p+3])cosmetic[p]=Math.max(0,cosmetic[p]-1)
assert(flowMetrics('flow-pool-drop',drop,cosmetic)!.massBeyond50px===0,'Grain change must not count as transport')
const moved=new Uint8Array(drop.rgba.length);for(let y=0;y<1024;y++)for(let x=0;x<924;x++){const p=(y*1024+x)*4,q=(y*1024+x+100)*4;moved.set(drop.rgba.subarray(p,p+4),q)}
assert(flowMetrics('flow-pool-drop',drop,moved)!.massBeyond50px>.5,'Transport must be measurable')
const colors=createFlowFixture('flow-separated-colors'),base=flowMetrics('flow-separated-colors',colors,colors.rgba)!
assert(base.initialMixedPixels===0&&base.mixedCarrierFraction===0&&base.blueCrossFraction===0&&base.yellowCrossFraction===0,'Separated input must start unmixed')
const wall=createFlowFixture('flow-dry-barrier'),leak=wall.rgba.slice();leak.set([10,0,0,10],(512*1024+512)*4)
assert(flowMetrics('flow-dry-barrier',wall,leak)!.changedDryPixels===1,'Dry leak must be detected')
console.log(JSON.stringify({passed:5,scope:'Functional metric oracle; not solver approval'}))
const thin=createFlowFixture('flow-one-pixel-wall'),legal=new Uint8Array(thin.rgba.length);legal.set([10,0,0,10],(512*1024+512)*4)
assert(flowMetrics('flow-one-pixel-wall',thin,legal)!.blueCrossFraction===0,'Left column512 is before wall513')
legal.set([10,0,0,10],(512*1024+514)*4)
assert(flowMetrics('flow-one-pixel-wall',thin,legal)!.blueCrossFraction>0,'Column514 is beyond wall513')
console.log(JSON.stringify({barrierBoundaryChecks:2}))

const through=createFlowFixture('dynamic-stroke-through-pool'),throughCheck=dynamicMetrics('dynamic-stroke-through-pool',through,through.rgba)!
assert(throughCheck.insideOutsideWidthRatio===1,'Reference stroke same width inside/outside pool')
const separate=createFlowFixture('dynamic-two-strokes'),separateCheck=dynamicMetrics('dynamic-two-strokes',separate,separate.rgba)!
assert(separateCheck.initialMixedPixels===0&&separateCheck.mixedCarrierFraction===0,'Parallel stroke input must be unmixed')
console.log(JSON.stringify({dynamicChecks:2}))

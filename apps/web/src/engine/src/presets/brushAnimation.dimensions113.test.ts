import{describe,it,expect}from'vitest'
import{packDabs,unpackDabs,type BrushDescriptor,type Dab}from'@grafetto/shared'
import{brushAnimationIndex,behaviorStampsForDab,beginBrushBehavior}from'./brushBehavior'
import{digitalBrushFromPreset}from'./digitalBrushPresets'
type Dim=NonNullable<NonNullable<BrushDescriptor['tip']['animation']>['dimensions']>[number]
const frames:NonNullable<BrushDescriptor['tip']['animation']>['frames']=['a','b','c'].map(x=>`asset:${x.repeat(64)}`as const)
function brush(dimensions:Dim[]):BrushDescriptor{const angular=dimensions.some(d=>d.mode==='angular'),tilt=dimensions.some(d=>d.mode==='xtilt'||d.mode==='ytilt');return{...digitalBrushFromPreset('hard-round'),version:113,tip:{kind:'bitmap',mask:frames[0],animation:{mode:'dimensions',dimensions,frames,...(angular?{cursorPolicy:'first-request-v1'}:{}),...(tilt?{roundingPolicy:'qt5-half-up-v1'}:{})},hardness:1,aspect:1,angle:0,rotation:'fixed'},scatter:undefined,behavior:{version:2,...(angular?{strokeInput:{version:1,initialDirection:'cursorHistory'}}:{}),speedInput:{version:1,space:'view',maximum:30,estimator:'grafettoEMA30ms'},rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}}
const d:Dab={x:0,y:0,pressure:1,normalizedSpeed:0,size:10,tiltX:-2,tiltY:0,sourceAngle:0,aspectRatio:1,angle:0,opacity:1,t:0}
describe('113 runtime signed tensor selection',()=>{
 it('adds signed strides before ONE uint32/actual EOF modulo',()=>{
  const b=brush([{mode:'pressure',rank:2},{mode:'xtilt',rank:3}]);expect(brushAnimationIndex(b.tip,1,9,0,1,0,0,-2,0)).toBe(1)
  // Raw terms 3 + (-2) = 1; per-axis unsigned/modulo gives 2, a distinct wrong frame.
  expect(behaviorStampsForDab(b,d,beginBrushBehavior(d),[0,0,0])[0].mask).toBe(frames[1])
 })
 it('keeps dimension0 slowest and actual EOF independent of declared product',()=>{
  const a=brush([{mode:'pressure',rank:2},{mode:'constant',rank:3}]);a.tip.animation!.frames=[...frames,...frames.slice(0,2)]
  const b=brush([{mode:'constant',rank:3},{mode:'pressure',rank:2}]);b.tip.animation!.frames=a.tip.animation!.frames
  expect(brushAnimationIndex(a.tip,1,0,0,1)).toBe(3);expect(brushAnimationIndex(b.tip,1,0,0,1)).toBe(1)
  const single=brush([{mode:'angular',rank:8},{mode:'pressure',rank:2}]);expect(brushAnimationIndex(single.tip,1,0,0,1,0,0)).toBe(1)
  single.tip.animation!.frames=[frames[0]];expect(brushAnimationIndex(single.tip,1,0,0,1,0,Math.PI)).toBe(0)
 })
 it('unions captured channels and preserves rejected angular attempts/distance through chunks',()=>{
  const b=brush([{mode:'pressure',rank:2},{mode:'xtilt',rank:2},{mode:'velocity',rank:2},{mode:'angular',rank:2}]);b.behavior!.modulations={opacity:[{control:'distance',period:10,minimum:0,jitter:0}]}
  const inputs=[[0,0],[.25,0],[.25,.25],[0,.25],[0,0],[0,.5]].map(([x,y],i)=>({...d,x,y,t:i,normalizedSpeed:.5}))
  const run=(chunk:number)=>{let state=beginBrushBehavior(d);const out=[];for(let i=0;i<inputs.length;i+=chunk){state=structuredClone(state);for(const input of unpackDabs(packDabs(inputs.slice(i,i+chunk))))out.push(...behaviorStampsForDab(b,input,state,[0,0,0]))}return{state,out}}
  const result=run(1);expect(result).toEqual(run(4));expect(result.out).toHaveLength(2);expect(result.state.worldDistance).toBe(1.5);expect(result.state.dabOrdinal).toBe(6)
  const state=beginBrushBehavior(d),before=structuredClone(state);expect(()=>behaviorStampsForDab(b,{...d,sourceAngle:undefined},state,[0,0,0])).toThrow();expect(state).toEqual(before)
 })
 it('retains Qt5 signed half policy and rejects unsupported tensor selectors',()=>{
  const b=brush([{mode:'constant',rank:2},{mode:'xtilt',rank:3}]);expect(brushAnimationIndex(b.tip,0,0,0,1,0,0,-1,0)).toBe(0)
  Object.assign(b.tip.animation!.dimensions![0],{mode:'future-selector'});expect(()=>brushAnimationIndex(b.tip,0,0,0,1,0,0,-1,0)).toThrow()
 })
})

it('selects high indices from a 738-frame tensor without truncation',()=>{
 const b=brush([{mode:'angular',rank:18},{mode:'incremental',rank:41}]);b.tip.animation!.frames=Array.from({length:738},(_,i)=>`asset:${i.toString(16).padStart(64,'0')}` as const)
 const index=brushAnimationIndex(b.tip,1,40,0,1,0,0,0,0);expect(index).toBeGreaterThanOrEqual(0);expect(index).toBeLessThan(738)
})

it('uses the actual surplus frame count for signed index modulo',()=>{
 const b=brush([{mode:'pressure',rank:2},{mode:'xtilt',rank:2}]);b.tip.animation!.frames=[...frames,...frames.slice(0,2)]
 expect(brushAnimationIndex(b.tip,1,0,0,0,0,0,-1,0)).toBe(0)
})

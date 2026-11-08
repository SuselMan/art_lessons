import{describe,it,expect}from'vitest'
import{packDabs,unpackDabs,type BrushDescriptor,type Dab}from'@grafetto/shared'
import{beginBrushBehavior,behaviorStampsForDab,brushAnimationIndex,brushAnimationFrame}from'./brushBehavior'
import{digitalBrushFromPreset}from'./digitalBrushPresets'
const frames:NonNullable<BrushDescriptor['tip']['animation']>['frames']=['a','b','c','d','e'].map(c=>`asset:${c.repeat(64)}`as const)
function brush(mode:'xtilt'|'ytilt'='xtilt',rank=5,actual=2):BrushDescriptor{return{...digitalBrushFromPreset('hard-round'),version:112,paperInteraction:0,tip:{kind:'bitmap',mask:frames[0],animation:{mode,rank,roundingPolicy:'qt5-half-up-v1',frames:frames.slice(0,actual)},hardness:1,aspect:1,angle:0,rotation:'fixed'},scatter:{count:3,radius:0,scale:1,sizeJitter:0,angleJitter:0,flowJitter:0},behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}}
const d:Dab={x:0,y:0,pressure:1,size:10,tiltX:0,tiltY:0,aspectRatio:1,angle:0,opacity:1,t:0},color:[number,number,number]=[.3,.5,.7]
function select(b:BrushDescriptor,x:number,y=0){return brushAnimationIndex(b.tip,1,99,0,1,undefined,undefined,x,y)}
describe('tilt112 Qt5 degree-axis selection',()=>{
 it('uses exact Qt5 negative-half-up, integer half-rank, unsigned actual-EOF modulo, not normalized degree or signed modulo',()=>{
  const b=brush();expect(select(b,-1)).toBe(0);expect(select(b,1)).toBe(1);expect(select(b,0)).toBe(0)
  expect(select(brush('xtilt',2),-.5)).toBe(1) // Away-from-zero would incorrectly select0.
  expect(select(brush('xtilt',2),-.5000000596046448)).toBe(0);expect(select(brush('xtilt',2),-.4999999701976776)).toBe(1)
  expect(select(brush('xtilt',5,3),-2)).toBe(1) // signed -3 normalized mod3 would incorrectly select0.
  expect(select(brush('xtilt',5,5),-60)).toBe(3);expect(select(brush('xtilt',5,5),60)).toBe(2)
  expect(select(brush('xtilt',256),-90)).toBe(0);expect(select(brush('xtilt',256),90)).toBe(0)
  expect(select(b,1)).not.toBe(select(b,1/90));expect(brushAnimationFrame(b.tip,1,99,0,1,undefined,undefined,1,0)).toBe(frames[1])
 })
 it('selects X/Y independently and rounds the captured axis to F32 before thresholds',()=>{
  expect(select(brush('xtilt'),-1,1)).toBe(0);expect(select(brush('ytilt'),-1,1)).toBe(1)
  expect(select(brush('xtilt',2),-.500000001)).toBe(1) // Captured F32 is exactly-.5.
  expect(select(brush('ytilt',2),88,-.500000001)).toBe(1)
 })
 it('does not import Angular movement gates; every stationary request selects ONCE before all duplicates and split/wire/clone continuation',()=>{
  const b=brush(),inputs=[-1,1,0,-2,1].map((tiltX,i)=>({...d,tiltX,t:i})),run=(chunk:number)=>{let state=beginBrushBehavior(inputs[0]);const out=[];for(let i=0;i<inputs.length;i+=chunk){state=structuredClone(state);for(const dab of unpackDabs(packDabs(inputs.slice(i,i+chunk))))out.push(...behaviorStampsForDab(b,dab,state,color))}return{out,state}}
  const all=run(5);expect(all).toEqual(run(1));expect(all).toEqual(run(2));expect(all.out).toHaveLength(15);expect(all.state.dabOrdinal).toBe(5);expect(all.state.angularCursor).toBeUndefined();expect(all.out.map(s=>s.mask)).toEqual([frames[0],frames[1],frames[0],frames[1],frames[1]].flatMap(mask=>[mask,mask,mask]))
 })
 it('rejects missing/nonfinite/signed-overflow captured axis, invalid policy/rank/revision and forged child BEFORE state mutation',()=>{
  const b=brush(),state=beginBrushBehavior(d),before=structuredClone(state)
  for(const tiltX of[NaN,Infinity,-Infinity,1e30,-1e30]){expect(()=>behaviorStampsForDab(b,{...d,tiltX},state,color)).toThrow();expect(state).toEqual(before)}
  const badVersion=brush();badVersion.version=111;expect(()=>behaviorStampsForDab(badVersion,d,state,color)).toThrow();expect(state).toEqual(before)
  const badPolicy=brush();if(!badPolicy.tip.animation)throw Error('fixture');delete badPolicy.tip.animation.roundingPolicy;expect(()=>behaviorStampsForDab(badPolicy,d,state,color)).toThrow();expect(state).toEqual(before)
  for(const rank of[1,257,NaN]){const bad=brush();if(!bad.tip.animation)throw Error('fixture');bad.tip.animation.rank=rank;expect(()=>behaviorStampsForDab(bad,d,state,color)).toThrow();expect(state).toEqual(before)}
  const parent=brush();delete parent.tip.animation;if(!parent.behavior)throw Error('fixture');parent.behavior.dual={brush:b,blendMode:'normal',sampling:'independent'};expect(()=>behaviorStampsForDab(parent,d,state,color)).toThrow('child');expect(state).toEqual(before)
 })
 it('accepts interpolated overshoot and rejects unsafe tensor stride products before state advances',()=>{
  const b=brush(),state=beginBrushBehavior(d)
  expect(()=>behaviorStampsForDab(b,{...d,tiltX:91.93536376953125},state,color)).not.toThrow()
  expect(state.dabOrdinal).toBe(1)
  b.version=113;b.tip.animation={mode:'dimensions',dimensions:[{mode:'xtilt',rank:2},{mode:'constant',rank:2}],roundingPolicy:'qt5-half-up-v1',frames:frames.slice(0,3)}
  const before=structuredClone(state)
  expect(()=>behaviorStampsForDab(b,{...d,tiltX:1073741824},state,color)).toThrow()
  expect(state).toEqual(before)
 })
 it('keeps91pressure/constant,92velocity and110Angular graphs in their historical argument slots',()=>{
  const b=brush();b.tip.animation={mode:'pressure',rank:5,frames:frames.slice(0,2)};expect(brushAnimationIndex(b.tip,1,0,0,.375)).toBe(0);b.tip.animation={mode:'constant',frames:frames.slice(0,2)};expect(brushAnimationIndex(b.tip,1,99)).toBe(0);b.tip.animation={mode:'velocity',rank:5,frames:frames.slice(0,2)};expect(brushAnimationIndex(b.tip,1,0,0,1,.125)).toBe(0);b.tip.animation={mode:'angular',rank:8,cursorPolicy:'first-request-v1',frames:frames.slice(0,2)};expect(brushAnimationIndex(b.tip,1,0,0,1,undefined,0)).toBe(1)
 })
})

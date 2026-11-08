import{describe,it,expect}from'vitest'
import{packDabs,unpackDabs,type BrushDescriptor,type Dab}from'@grafetto/shared'
import{brushAnimationIndex,behaviorStampsForDab,beginBrushBehavior}from'./brushBehavior'
import{assertSameBrushExecutionContext}from'./brushExecutionContext'
import{digitalBrushFromPreset}from'./digitalBrushPresets'
type Dim=NonNullable<NonNullable<BrushDescriptor['tip']['animation']>['dimensions']>[number]
const frames=Array.from({length:16},(_,i)=>`asset:${i.toString(16).padStart(64,'0')}`as const)
function brush(dimensions:Dim[],count=16):BrushDescriptor{const random=dimensions.some(d=>d.mode==='random'),angular=dimensions.some(d=>d.mode==='angular');return{...digitalBrushFromPreset('hard-round'),version:115,scatter:undefined,tip:{kind:'bitmap',mask:frames[0],hardness:1,aspect:1,angle:0,rotation:'fixed',animation:{mode:'dimensions',dimensions,frames:frames.slice(0,count),...(random?{randomPolicy:'grafetto-dim-stream-v1'}:{}),...(angular?{cursorPolicy:'first-request-v1'}:{})}},behavior:{version:2,...angular?{strokeInput:{version:1,initialDirection:'cursorHistory'}}:{},rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}}
const dab:Dab={x:0,y:0,pressure:1,size:10,tiltX:0,tiltY:0,angle:0,sourceAngle:0,aspectRatio:1,opacity:1,t:0},seeds={version:1 as const,sequentialSeed:29,strokeSeed:123456789},execution={brushRandom:seeds}
const select=(b:BrushDescriptor,n:number,seed=seeds.strokeSeed,stateSeed=3)=>brushAnimationIndex(b.tip,stateSeed,n,0,1,0,0,0,0,seed)!
describe('115 captured dimension streams',()=>{
 it('uses one ordinal on every incremental axis, preserving LCM correlations rather than odometer',()=>{
  const b=brush([{mode:'incremental',rank:2},{mode:'incremental',rank:3}],6)
  expect(Array.from({length:6},(_,n)=>select(b,n))).toEqual([0,4,2,3,1,5])
  const equal=brush([{mode:'incremental',rank:2},{mode:'incremental',rank:2}],4)
  expect(Array.from({length:6},(_,n)=>select(equal,n))).toEqual([0,3,0,3,0,3])
 })
 it('salts equal-rank random axes independently using only captured strokeSeed',()=>{
  const b=brush([{mode:'random',rank:4},{mode:'random',rank:4}]),indices=Array.from({length:128},(_,n)=>select(b,n))
  expect(indices.some(i=>Math.floor(i/4)!==i%4)).toBe(true) // Removing dimensionIndex salt collapses every result to diagonal.
  expect(new Set(indices).size).toBe(16)
  expect(indices).toEqual(Array.from({length:128},(_,n)=>select(b,n,seeds.strokeSeed,999)))
  expect(indices).not.toEqual(Array.from({length:128},(_,n)=>select(b,n,seeds.strokeSeed+1)))
 })
 it('keeps codec/chunk/fork continuation and rejects missing seeds/policy/version before state',()=>{
  const b=brush([{mode:'random',rank:4},{mode:'incremental',rank:4}]),inputs=Array.from({length:20},(_,i)=>({...dab,x:i,t:i}))
  const run=(chunk:number)=>{let state=beginBrushBehavior(dab,execution);const out=[];for(let i=0;i<inputs.length;i+=chunk){state=structuredClone(state);for(const d of unpackDabs(packDabs(inputs.slice(i,i+chunk))))out.push(...behaviorStampsForDab(b,d,state,[0,0,0]))}return{state,out}}
  expect(run(1)).toEqual(run(7));expect(run(20)).toEqual(run(7))
  const state=beginBrushBehavior(dab),before=structuredClone(state);expect(()=>behaviorStampsForDab(b,dab,state,[0,0,0])).toThrow();expect(state).toEqual(before)
  for(const edit of[(c:BrushDescriptor)=>{c.version=114},(c:BrushDescriptor)=>{delete c.tip.animation!.randomPolicy}]){const c=structuredClone(b);edit(c);const s=beginBrushBehavior(dab,execution),old=structuredClone(s);expect(()=>behaviorStampsForDab(c,dab,s,[0,0,0])).toThrow();expect(s).toEqual(old)}
  expect(()=>assertSameBrushExecutionContext(execution,{brushRandom:{...seeds,strokeSeed:seeds.strokeSeed+1}})).toThrow()
 })
 it('counts rejected angular attempts once while random queries leave other RNG state unchanged',()=>{
  const b=brush([{mode:'angular',rank:2},{mode:'random',rank:4}],8),s=beginBrushBehavior(dab,execution),originalSeed=s.seed
  behaviorStampsForDab(b,dab,s,[0,0,0]);expect(behaviorStampsForDab(b,{...dab,x:.25},s,[0,0,0])).toHaveLength(0);expect(s.dabOrdinal).toBe(2);expect(s.seed).toBe(originalSeed)
  const flat=structuredClone(b);flat.tip.animation={mode:'incremental',frames:frames.slice(0,3)};expect(brushAnimationIndex(flat.tip,1,5)).toBe(2)
  flat.tip.animation={mode:'random',frames:frames.slice(0,3)};expect(brushAnimationIndex(flat.tip,1,5)).toBe(brushAnimationIndex(flat.tip,1,5,0,undefined,undefined,undefined,undefined,undefined,999))
 })
})

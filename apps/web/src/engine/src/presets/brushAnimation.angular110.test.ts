import{describe,it,expect}from'vitest'
import{packDabs,unpackDabs,type BrushDescriptor,type Dab}from'@grafetto/shared'
import{beginBrushBehavior,behaviorStampsForDab,brushAnimationIndex}from'./brushBehavior'
import{digitalBrushFromPreset}from'./digitalBrushPresets'
const frames:NonNullable<BrushDescriptor['tip']['animation']>['frames']=Array.from({length:8},(_,i)=>`asset:${String(i).repeat(64)}`as const)
function brush():BrushDescriptor{return{...digitalBrushFromPreset('hard-round'),version:110,tip:{kind:'bitmap',mask:frames[0],animation:{mode:'angular',rank:8,cursorPolicy:'first-request-v1',frames},hardness:1,aspect:1,angle:0,rotation:'fixed'},scatter:{count:2,radius:.1,scale:1,sizeJitter:0,angleJitter:0,flowJitter:0},behavior:{version:2,strokeInput:{version:1,initialDirection:'cursorHistory'},rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}}
const d:Dab={x:0,y:0,pressure:1,size:10,tiltX:0,tiltY:0,aspectRatio:1,angle:0,sourceAngle:0,opacity:1,t:0},color:[number,number,number]=[.3,.5,.7]
describe('angular110 logical attempts',()=>{
 it('selects captured angle before geometry with wrap and actual frame modulo',()=>{
  const b=brush();for(const[a,index]of[[0,3],[Math.PI/2,5],[Math.PI,7],[-Math.PI/2,1]])expect(brushAnimationIndex(b.tip,1,99,0,1,undefined,a)).toBe(index)
  b.tip.animation!.frames=frames.slice(0,3);expect(brushAnimationIndex(b.tip,1,99,0,1,undefined,Math.PI)).toBe(1)
  expect(brushAnimationIndex(b.tip,1,99,0,1,undefined,.1)).toBe(brushAnimationIndex(b.tip,1,99,0,1,undefined,.1+Math.PI*2))
 })
 it('registers rejected attempts without accumulating movement or consuming geometry',()=>{
  const b=brush(),s=beginBrushBehavior(d);expect(behaviorStampsForDab(b,d,s,color)).toHaveLength(2)
  const painted=structuredClone(s.previous)
  for(const x of[.25,.5,.75])expect(behaviorStampsForDab(b,{...d,x},s,color)).toEqual([])
  expect(s.angularCursor).toEqual({x:.75,y:0});expect(s.dabOrdinal).toBe(4);expect(s.dabSequence).toBe(4);expect(s.previous).toEqual(painted)
  expect(behaviorStampsForDab(b,{...d,x:1.25,sourceAngle:Math.PI/2},s,color).map(x=>x.mask)).toEqual([frames[5],frames[5]])
  expect(s.dabOrdinal).toBe(5)
  const beforeRejected=structuredClone(s)
  expect(behaviorStampsForDab(b,{...d,x:1.25},s,color)).toEqual([])
  expect(s.previous).toEqual(beforeRejected.previous)
  expect(s.axes).toEqual(beforeRejected.axes)
 })
 it('rejects missing captured angle before mutation and survives wire/chunk/clone continuation',()=>{
  const b=brush(),s=beginBrushBehavior(d),before=structuredClone(s);expect(()=>behaviorStampsForDab(b,{...d,sourceAngle:undefined},s,color)).toThrow();expect(s).toEqual(before)
  const inputs=[0,.25,.5,1,1,1.5,2].map((x,i)=>({...d,x,t:i,sourceAngle:i*Math.PI/4}))
  const run=(chunk:number)=>{let state=beginBrushBehavior(inputs[0]);const out=[];for(let i=0;i<inputs.length;i+=chunk){state=structuredClone(state);for(const dab of unpackDabs(packDabs(inputs.slice(i,i+chunk))))out.push(...behaviorStampsForDab(b,dab,state,color))}return{out,state}}
  expect(run(1)).toEqual(run(4))
 })
 it('does not change old selectors or accepted scatter and rejects rank1 policy',()=>{
  const b=brush(),plain=brush();plain.tip.animation=undefined
  const strip=(xs:ReturnType<typeof behaviorStampsForDab>)=>xs.map(({mask:_mask,...s})=>s)
  expect(strip(behaviorStampsForDab(b,d,beginBrushBehavior(d),color))).toEqual(strip(behaviorStampsForDab(plain,d,beginBrushBehavior(d),color)))
  b.tip.animation!.mode='incremental';delete b.tip.animation!.rank;delete b.tip.animation!.cursorPolicy
  expect(brushAnimationIndex(b.tip,1,9)).toBe(1)
  b.tip.animation={mode:'angular',rank:1,cursorPolicy:'first-request-v1',frames};expect(()=>brushAnimationIndex(b.tip,1,0,0,1,undefined,0)).toThrow()
 })
})

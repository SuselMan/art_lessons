import{describe,expect,it,vi}from'vitest'
import{packDabs,unpackDabs,type BrushDescriptor,type Dab}from'@grafetto/shared'
import{brushAnimationIndex,beginBrushBehavior,behaviorStampsForDab,secondaryBrushDabs}from'./brushBehavior'
import{digitalBrushFromPreset}from'./digitalBrushPresets'
import{normalizedBrushSpeed}from'../input/brushSpeed'
import{assertBrushSourceInputs}from'./brushExecutionContext'
import{gihVelocity92Cases}from'./gihVelocity92Cases'
const frames:NonNullable<BrushDescriptor['tip']['animation']>['frames']=['1','2','3'].map(v=>`asset:${v.repeat(64)}`as const)
const speedInput={version:1 as const,space:'view' as const,maximum:30,estimator:'grafettoEMA30ms' as const}
function brush(rank=5):BrushDescriptor{return{...digitalBrushFromPreset('hard-round'),id:'imported-abcdefabcdeffedcbafedcba',version:92,tip:{kind:'bitmap',mask:frames[0],animation:{mode:'velocity',rank,frames},hardness:1,aspect:1,angle:0,rotation:'fixed'},scatter:{count:3,radius:.2,scale:1,sizeJitter:.1,angleJitter:.2,flowJitter:0},behavior:{version:2,speedInput}}}
const dab:Dab={x:20,y:30,pressure:.5,normalizedSpeed:0,size:30,tiltX:0,tiltY:0,aspectRatio:1,angle:0,opacity:1,t:0},color:[number,number,number]=[.2,.4,.6]
describe('revision92 captured velocity selection',()=>{
 it('matches independent Decimal80 vectors at every selected reachable threshold and adjacent f32, with actual-frame modulo',()=>{
  const raw=new Uint32Array(1),f=new Float32Array(raw.buffer)
  for(const[rank,bits,expected]of gihVelocity92Cases){raw[0]=bits
   for(const count of[2,3]){const b=brush(rank);b.tip.animation!.frames=frames.slice(0,count);expect(brushAnimationIndex(b.tip,99,19,0,.9,f[0])).toBe(expected%count)}
  }
 })
 it('keeps native normalized domain instead of stretching to all frames',()=>{
  const b=brush();b.tip.animation!.frames=frames.slice(0,2)
  expect(brushAnimationIndex(b.tip,0,0,0,1,.125)).toBe(0)
  expect(brushAnimationIndex(b.tip,0,0,0,1,1)).toBe(1)
  const two=brush(2);expect(brushAnimationIndex(two.tip,0,0,0,1,1)).toBe(0)
  expect(()=>brushAnimationIndex(brush(257).tip,0,0,0,1,1)).toThrow(/captured velocity/)
 })
 it('uses existing speed capture and packed channel, not pressure or t',()=>{
  const b=brush(),v=normalizedBrushSpeed({viewSpeed:3.75},speedInput)
  const input={...dab,normalizedSpeed:v},replayed=unpackDabs(packDabs([input]))[0]
  expect(replayed.normalizedSpeed).toBe(.125)
  expect(brushAnimationIndex(b.tip,1,1,0,0,v)).toBe(brushAnimationIndex(b.tip,1,1,0,1,replayed.normalizedSpeed))
  expect(behaviorStampsForDab(b,input,beginBrushBehavior(input),color).map(s=>s.mask)).toEqual(Array(3).fill(frames[0]))
 })
 it('queries once per logical primary and inline-child, before count duplicates, with unchanged jitter',()=>{
  const b=brush(),child=brush(256);b.behavior={version:2,speedInput,dual:{brush:child,blendMode:'multiply'}}
  const input={...dab,normalizedSpeed:.125},state=beginBrushBehavior(input)
  const log=vi.spyOn(Math,'log')
  try{const stamps=behaviorStampsForDab(b,input,state,color);expect(log).toHaveBeenCalledTimes(2);expect(stamps).toHaveLength(3);expect(new Set(stamps.map(s=>s.mask)).size).toBe(1);expect(new Set(stamps.map(s=>s.dualMask)).size).toBe(1)}finally{log.mockRestore()}
  const plain=brush();plain.tip.animation=undefined;plain.behavior={version:2,speedInput}
  const own=brush(),a=beginBrushBehavior(input),z=beginBrushBehavior(input)
  expect(behaviorStampsForDab(own,input,a,color).map(({mask:_mask,...s})=>s)).toEqual(behaviorStampsForDab(plain,input,z,color))
 })
 it('never queries independent velocity child on parent and samples only emitted child speed',()=>{
  const child=brush(),parent=brush();parent.tip.animation={mode:'incremental',frames};parent.behavior={version:2,speedInput,dual:{brush:child,sampling:'independent',blendMode:'multiply'}}
  const start={...dab,normalizedSpeed:.125},resume={...dab,x:dab.x+.00001,normalizedSpeed:1},sampling={remaining:0},childState=beginBrushBehavior(start)
  const first=secondaryBrushDabs(parent,child,[start],sampling);expect(first).toHaveLength(1)
  const log=vi.spyOn(Math,'log')
  try{const stamps=behaviorStampsForDab(parent,resume,beginBrushBehavior(start),color);expect(log).not.toHaveBeenCalled();expect(stamps.every(s=>s.dualMask===undefined)).toBe(true)
   expect(secondaryBrushDabs(parent,child,[resume],sampling)).toEqual([])
   expect(behaviorStampsForDab(child,first[0],childState,color)[0].mask).toBe(frames[0]);expect(log).toHaveBeenCalledTimes(1)
  }finally{log.mockRestore()}
 })
 it('keeps independent speed interpolation through chunks, wire and gesture forks',()=>{
  const primary=brush(),child=brush(128),inputs=Array.from({length:20},(_,i)=>({...dab,x:dab.x+i*3,t:i*8,normalizedSpeed:Math.fround(i/19)}))
  const run=(chunk:number)=>{const sampling={remaining:0};let state=beginBrushBehavior(inputs[0]);const out=[]
   for(let i=0;i<inputs.length;i+=chunk){state=structuredClone(state);const packed=unpackDabs(packDabs(inputs.slice(i,i+chunk)));for(const d of secondaryBrushDabs(primary,child,packed,sampling))out.push(...behaviorStampsForDab(child,d,state,color))}return out}
  expect(run(7)).toEqual(run(20));expect(new Set(run(20).map(s=>s.mask)).size).toBe(3)
 })
 it('rejects missing/invalid speed and missing root capture BEFORE any author state change, including independent role',()=>{
  for(const role of['own','inline','independent']as const)for(const normalizedSpeed of[undefined,NaN,Infinity,-.01,1.01]){
   const b=brush();if(role!=='own'){b.tip.animation={mode:'incremental',frames};b.behavior={version:2,speedInput,dual:{brush:brush(),blendMode:'multiply',...(role==='independent'?{sampling:'independent' as const}:{})}}}
   const state=beginBrushBehavior(dab),before=structuredClone(state),bad={...dab,normalizedSpeed}
   expect(()=>assertBrushSourceInputs(b,[dab,bad])).toThrow();expect(()=>behaviorStampsForDab(b,bad,state,color)).toThrow(/velocity/);expect(state).toEqual(before)
  }
  const b=brush();delete b.behavior!.speedInput;const state=beginBrushBehavior(dab),before=structuredClone(state)
  expect(()=>behaviorStampsForDab(b,dab,state,color)).toThrow(/root captured/);expect(state).toEqual(before)
 })
})

import { DabSystem } from '../dabs/DabSystem'
import { brushPreparationPlan } from '../dabs/BrushPreparation'
import { brush119, assets119, rgb119 } from '../../../../../../packages/shared/src/gihOriginalRgba119.testFixture'
import { expect, it } from 'vitest'
import { hasIndependentMask190Scope, type Dab } from '@grafetto/shared'
import { childSize187 } from '../../../../../../packages/shared/src/childAbsoluteSize187.testFixture'
import { brush124, assets124, pixels124 } from '../../../../../../packages/shared/src/gihUnequalLightness124.testFixture'
import { mask190ChildExecution, mask190RootExecution } from './independentMask190'
import { brushExecutionContext, assertBrushExecutionContext, assertBrushSourceInputs } from './brushExecutionContext'
import { beginBrushBehavior, behaviorStampsForDab, secondaryBrushDabs, type SecondarySamplingState } from './brushBehavior'
import { captureLatchedRecordedPenInput, assertRecordedPen188Brush } from './recordedPen188'
import { installBrushPixels } from './importedBrushes'
import { prepareVariableGih, variableGihStamp } from './gihFramePreparation'

function pair() {
  const root = childSize187(), child = root.behavior!.dual!.brush
  root.version = child.version = 190
  child.sizeByPressure = [[0,1],[1,1]]
  child.behavior!.modulations = undefined
  root.tip = {kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'}
  child.tip = {...root.tip}
  const primary = mask190RootExecution(root,brushExecutionContext({version:1,sequentialSeed:0,strokeSeed:0xffffffff}))!
  return {root,child,primary,execution:mask190ChildExecution(root,primary)!}
}
const point=(x=0,y=0):Dab=>({x,y,size:4,sourceSize:4,sourceScale:1,pressure:.5,tiltX:0,tiltY:0,sourceTwist:0,sourceTangentialPressure:.5,sourceAngle:Math.PI/2,normalizedSpeed:.25,aspectRatio:1,angle:0,opacity:1,t:0})
it('validates whole roles once and keeps the author hot path independent of descriptor resource scans',()=>{
 const {root,child,primary}=pair()
 expect(hasIndependentMask190Scope(root)).toBe(true)
 expect(assertRecordedPen188Brush(root)).toBe(true)
 expect(()=>mask190RootExecution(child)).toThrow('whole')
 expect(()=>mask190RootExecution({...child,id:'another'},mask190ChildExecution(root,primary))).toThrow('role')
 Object.defineProperty(root,'tip',{get:()=>{throw Error('unexpected resource scan')}})
 expect(mask190RootExecution(root,primary)).toBe(primary)
 expect(()=>assertBrushExecutionContext(root,primary)).not.toThrow()
 expect(()=>assertBrushSourceInputs(root,[point()],undefined,primary)).not.toThrow()
 expect(captureLatchedRecordedPenInput(root,{pointerType:'pen',sourceTwist:271,sourceTangentialPressure:.25})).toEqual({sourceTwist:271,sourceTangentialPressure:.25})
})
it('preserves explicit child role through clone/fork state and rejects missing canonical input before sampling',()=>{
 const {child,execution}=pair(),state=beginBrushBehavior(point(),execution)
 expect(structuredClone(state).execution?.maskRole190).toEqual(execution.maskRole190)
 expect(()=>assertBrushSourceInputs(child,[{...point(),sourceTwist:undefined}],undefined,execution)).toThrow('recorded pen')
 expect(()=>assertBrushSourceInputs(child,[{...point(),sourceSize:undefined}],undefined,execution)).toThrow()
})
it('uses child-own max pressure and native no-assistant perspective while retaining control curves',()=>{
 const {child,execution}=pair()
 child.behavior!.dynamics={opacity:{control:'pressureIn',minimum:0,jitter:0},flow:{control:'perspective',minimum:0,jitter:0,curve:[[0,.25],[1,.75]]}}
 const state=beginBrushBehavior(point(),execution)
 const values=[.2,.8,.1].map((pressure,i)=>behaviorStampsForDab(child,{...point(i,0),pressure},state,[1,1,1])[0])
 expect(values.map(v=>v.opacityScale)).toEqual([.2,.8,.8])
 expect(values.every(v=>v.flowScale===.75)).toBe(true)
 expect(state.maxPressure).toBe(.8)
 const fresh=beginBrushBehavior(point(),execution)
 expect(behaviorStampsForDab(child,{...point(),pressure:.1},fresh,[1,1,1])[0].opacityScale).toBe(.1)
})
it('applies the native absolute identity endpoint to all child dynamic targets, not only Size',()=>{
 for(const target of ['size','roundness','opacity','flow'] as const){
  const {child,execution}=pair(),input={...point(),sourceAngle:Math.PI}
  const control={control:'off' as const,minimum:0,jitter:0,combine:{mode:'product' as const,constant:1,scaling:[],additive:[],absolute:{locked:false,angleOffset:0,curve:[[0,0],[1,1]] as [number,number][]}}}
  const plain=behaviorStampsForDab(child,input,beginBrushBehavior(input,execution),[1,1,1])
  child.behavior!.modulations={[target]:[control]}
  expect(behaviorStampsForDab(child,input,beginBrushBehavior(input,execution),[1,1,1])).toEqual(plain)
 }
})
it('inherits unpressured master diameter even at zero parent pressure scale and supports resource-size masks',()=>{
 const {root,child,execution}=pair(),input={...point(),size:0,pressure:0,sourceSize:12,sourceScale:0}
 const inherited=secondaryBrushDabs(root,child,[input],{remaining:0},true,undefined,execution)
 expect(inherited[0].size).toBe(12)
 root.behavior!.dual!.sizePolicy={kind:'resource',diameter:7}
 const resource=secondaryBrushDabs(root,child,[input],{remaining:0},true,undefined,execution)
 expect(resource[0].size).toBe(7)
 expect(resource[0].sourceSize).toBe(7)
})
it('keeps own child fan/geometry/pressure state invariant across chunks, savepoint clones and END',()=>{
 const {root,child,execution}=pair()
 child.behavior!.strokeInput!.fanCorners={stepDegrees:15}
 child.sizeByPressure=[[0,.1],[.5,.25],[1,1]]
 const inputs=[{...point(),pressure:.2},{...point(4,0),sourceSize:8,pressure:.8,t:20},{...point(4,4),sourceSize:12,pressure:.4,t:40}]
 const run=(chunk:number)=>{let sampling:SecondarySamplingState={remaining:0};const out:Dab[]=[];for(let i=0;i<inputs.length;i+=chunk){out.push(...secondaryBrushDabs(root,child,inputs.slice(i,i+chunk),sampling,true,undefined,execution));sampling=structuredClone(sampling)}return{sampling,out}}
 expect(run(1)).toEqual(run(3))
 const normal={remaining:0} as SecondarySamplingState,out=secondaryBrushDabs(root,child,inputs.slice(0,2),normal,true,undefined,execution)
 out.push(...secondaryBrushDabs(root,child,[],normal,true,{...inputs[2],baseSize:12},execution))
 expect(out).toEqual(run(3).out)
 expect(out.some((v,i)=>i>0&&v.x===out[i-1].x&&v.y===out[i-1].y&&v.sourceAngle!==out[i-1].sourceAngle)).toBe(true)
 expect(normal.geometry?.execution?.maskRole190?.role).toBe('child')
})
it('prepares every unequal child GIH frame and selects geometry from its own request state',()=>{
 const {child,execution}=pair(),source=brush124('dimensions')
 child.tip=structuredClone(source.tip)
 for(const asset of assets124)installBrushPixels(asset.id,pixels124(asset.id))
 const frames=prepareVariableGih(child,true)
 expect(frames.map(v=>[v.sourceWidth,v.sourceHeight])).toEqual([[4,2],[8,6],[2,4]])
 const state=beginBrushBehavior(point(),execution)
 const stamps=[point(),{...point(3,4),tiltX:1,t:20}].flatMap(d=>behaviorStampsForDab(child,d,state,[1,1,1]))
 for(const stamp of stamps){
  expect(stamp.frameIndex).toBeDefined()
  const geometry=variableGihStamp(child,frames,{...stamp,radius:stamp.size/2})
  expect(geometry.width).toBeGreaterThan(0)
  expect(geometry.height).toBeGreaterThan(0)
 }
})
it('retains unequal child IMAGESTAMP frame planes through the complete preparation inventory',()=>{
 const {root,child}=pair(),tip=brush119('dimensions').tip
 child.tip=structuredClone(tip)
 for(const asset of assets119)installBrushPixels(asset.id,new Uint8Array(asset.size*asset.size).fill(127))
 const plan=brushPreparationPlan(root)
 const frames=plan.resources.filter(r=>r.colorPlanes)
 expect(frames).toHaveLength(3)
 expect(frames.map(r=>r.colorPlanes)).toEqual(rgb119.map(v=>[...v]))
 expect(prepareVariableGih(child,true).map(r=>[r.sourceWidth,r.sourceHeight])).toEqual([[4,2],[8,6],[4,2]])
})

it('executes Mirror, Scatter, Ratio and Rotation controls in the child role independently',()=>{
 const {root,child,execution}=pair()
 const pressure={control:'pressure' as const,minimum:0,jitter:0}
 child.scatter={count:1,radius:.5,scale:1,sizeJitter:0,angleJitter:0,flowJitter:0}
 child.behavior!.scatter={countJitter:0,bothAxes:true,placement:'xyUniform'}
 child.behavior!.mirror={horizontal:true,vertical:false,value:1,dynamics:[pressure]}
 child.behavior!.dynamics={roundness:pressure,scatter:pressure}
 child.behavior!.rotation={follow:0,random:'none',composition:{strength:1,additive:[pressure]}}
 expect(hasIndependentMask190Scope(root)).toBe(true)
 const low=behaviorStampsForDab(child,{...point(),pressure:.25},beginBrushBehavior(point(),execution),[1,1,1])[0]
 const high=behaviorStampsForDab(child,{...point(),pressure:.75},beginBrushBehavior(point(),execution),[1,1,1])[0]
 expect(low.flipX).toBe(1);expect(high.flipX).toBe(-1)
 expect(low.aspect).toBe(4);expect(high.aspect).toBeCloseTo(4/3)
 expect(high.angle-low.angle).toBeCloseTo(Math.PI)
 expect([low.x,low.y]).not.toEqual([point().x,point().y])
 // Existing deterministic scatter seed includes pressure, so compare the
 // native interval bounds and disabled state rather than assuming shared draws.
 expect(Math.max(Math.abs(low.x),Math.abs(low.y))).toBeLessThanOrEqual(.5)
 expect(Math.max(Math.abs(high.x),Math.abs(high.y))).toBeLessThanOrEqual(1.5)
 const zero=behaviorStampsForDab(child,{...point(),pressure:0},beginBrushBehavior(point(),execution),[1,1,1])[0]
 expect([zero.x,zero.y]).toEqual([0,0])
})

it('captures the initial cursor angle for190 even when only the child needs directional input',()=>{
 const {root,primary}=pair();root.behavior!.strokeInput=undefined
 const sampler=new DabSystem();sampler.brushExecution=primary;sampler.recordedPen188=root;sampler.captureSourceAngle=true;sampler.captureSourceSize=true;sampler.initialDirection=1.25
 const first=sampler.startStroke(0,0,.5,0,0,16.3,0,.25,0,{sourceTwist:0,sourceTangentialPressure:.5})[0]
 expect(first.sourceAngle).toBe(1.25)
 expect(first.sourceSize).toBe(Math.fround(16.3))
 expect(sampler.forkForPreview().brushExecution?.maskRole190).toEqual(primary.maskRole190)
})

it('retains child pressure scaling exactly once in native sequential request geometry',()=>{
 const {root,child,execution}=pair()
 child.sizeByPressure=[[0,.5],[1,.5]]
 child.behavior!.sequentialRandom={version:1,kind:'qt5Taus88',policy:'scatterXY'}
 const requests=secondaryBrushDabs(root,child,[{...point(),sourceScale:0}],{remaining:0},true,undefined,execution)
 expect(requests[0].sourceScale).toBe(.5)
 expect(requests[0].size).toBe(2)
 const stamp=behaviorStampsForDab(child,requests[0],beginBrushBehavior(requests[0],execution),[1,1,1])[0]
 expect(stamp.sourceDiameter).toBe(2)
})

it('retains variable root GIH geometry while independently applying HSV and sharpness',()=>{
 const {root,primary}=pair()
 root.tip=structuredClone(brush124('dimensions').tip)
 for(const asset of assets124)installBrushPixels(asset.id,pixels124(asset.id))
 root.behavior!.colorAdjustment={hue:{control:'off',minimum:.75,jitter:0}}
 root.behavior!.dynamics={sharpness:{control:'pressure',minimum:0,jitter:0}}
 const frames=prepareVariableGih(root,true),input=point()
 const stamp=behaviorStampsForDab(root,input,beginBrushBehavior(input,primary),[1,0,0])[0]
 expect(stamp.color).not.toEqual([1,0,0])
 expect(stamp.sharpnessScale).toBe(.5)
 const geometry=variableGihStamp(root,frames,{...stamp,radius:stamp.size/2})
 expect(geometry.width).toBeGreaterThan(0)
 expect(geometry.height).toBeGreaterThan(0)
})

it('supports fractional resource diameter and master coefficient above one for child native Scatter only',()=>{
 const {root,child,execution,primary}=pair()
 root.behavior!.dual!.sizePolicy={kind:'resource',diameter:16.3}
 child.sizeByPressure=[[0,2],[1,2]]
 child.behavior!.sequentialRandom={version:1,kind:'qt5Taus88',policy:'scatterXY'}
 const request=secondaryBrushDabs(root,child,[{...point(),sourceScale:0,pressure:0}],{remaining:0},true,undefined,execution)[0]
 expect(request.sourceSize).toBe(Math.fround(16.3))
 expect(request.sourceScale).toBe(2)
 expect(()=>assertBrushSourceInputs(child,[request],undefined,execution)).not.toThrow()
 expect(()=>assertBrushSourceInputs(root,[{...point(),sourceScale:2}],undefined,primary)).toThrow()
 const stamp=behaviorStampsForDab(child,request,beginBrushBehavior(request,execution),[1,1,1])[0]
 expect(stamp.sourceDiameter).toBe(2*Math.fround(16.3))
})

it('commits own native geometry pressure history once per actual child request',()=>{
 const {root,child,execution}=pair()
 child.behavior!.sequentialRandom={version:1,kind:'qt5Taus88',policy:'scatterXY'}
 child.behavior!.dynamics={size:{control:'pressureIn',minimum:0,jitter:0}}
 const state:SecondarySamplingState={remaining:0}
 secondaryBrushDabs(root,child,[{...point(),pressure:.8},{...point(10),pressure:.1}],state,true,undefined,execution)
 expect(state.geometry!.maxPressure).toBe(.8)
 expect(state.geometry!.previous!.pressure).toBeLessThan(.8)
 expect(state.geometry!.sequentialRandom).toBeUndefined()
})

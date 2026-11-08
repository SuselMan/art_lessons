import{describe,it,expect}from'vitest'
import{packDabs,unpackDabs,type BrushDescriptor}from'@grafetto/shared'
import{DabSystem}from'./DabSystem'
import{PENCIL_DAB_SHAPING}from'../presets/dabShaping'
import{digitalBrushFromPreset}from'../presets/digitalBrushPresets'
import{beginBrushBehavior,behaviorStampsForDab}from'../presets/brushBehavior'
describe('angular110 existing author capture',()=>{
 it('captures finite source angles through ordinary DabSystem and replays frame choices from F64 wire',()=>{
  const id=`asset:${'a'.repeat(64)}`as const,b:BrushDescriptor={...digitalBrushFromPreset('hard-round'),version:110,tip:{kind:'bitmap',mask:id,animation:{mode:'angular',rank:8,cursorPolicy:'first-request-v1',frames:[id]},hardness:1,aspect:1,angle:0,rotation:'fixed'},behavior:{version:2,strokeInput:{version:1,initialDirection:'cursorHistory'},rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}
  const s=new DabSystem({spacingFactor:.2,shaping:{...PENCIL_DAB_SHAPING,size:()=>1,angle:()=>0,aspect:()=>1,pressureSmoothingPx:0,tiltSmoothingPx:0}})
  s.strokeInput=b.behavior!.strokeInput;s.initialDirection=.123456789012345;s.captureSourceSize=true
  const inputs=[...s.startStroke(0,0,.5,0,0,10,0,0,0),...s.continueStroke(20,0,.5,0,0,10,0,0,10),...s.endStroke(10)]
  expect(inputs.length).toBeGreaterThan(1);expect(inputs.every(d=>Number.isFinite(d.sourceAngle))).toBe(true)
  const recorded=unpackDabs(packDabs(inputs));expect(recorded.map(d=>d.sourceAngle)).toEqual(inputs.map(d=>d.sourceAngle))
  const run=(dabs:typeof inputs)=>{const state=beginBrushBehavior(dabs[0]);return dabs.flatMap(d=>behaviorStampsForDab(b,d,state,[.2,.3,.4])).map(d=>d.mask)}
  expect(run(recorded)).toEqual(run(inputs))
 })
})

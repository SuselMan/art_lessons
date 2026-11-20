import {expect,it} from 'vitest'
import {bristleSoakRound139,bristleSoakPoints139,bristleSoakStraight139} from './bristleSoak139'
import {bristleGeometryStamps,type BristleState} from './brushBristle'
import {beginBristleInkLine,advanceBristleInkLine,createBristleInkState,createBristleInkProfile} from './brushBristleInk'
import {advanceBristleInkBulk,bristleInkSpanOpacity} from './brushBristleInkBulk'
import {ink,brush,dab,soak} from './bristleSoak139TestFixture'
it('uses pinned Qt half-up negative ties and recovers raw integer grid before adding anchor',()=>{
 expect([-2.5,-1.5,-.5,.5,1.5].map(bristleSoakRound139)).toEqual([-2,-1,0,1,2])
 expect(bristleSoakPoints139(brush,dab)).toEqual([{x:-1,y:-1},{x:1,y:-1}])
 const changed={...brush,bristle:{...brush.bristle!,scale:3,shear:8,random:10}}
 expect(bristleSoakPoints139(changed,{...dab,size:97,angle:2,pressure:1})).toEqual(bristleSoakPoints139(brush,dab))
})
it('unpremultiplies once, canonicalizes invisible RGB and owns detached bytes',()=>{
 const pma=new Uint8Array([64,32,0,128,255,255,255,0,255,127,39,255])
 const rgba=bristleSoakStraight139(pma,3)
 expect([...rgba]).toEqual([128,64,0,128,0,0,0,0,255,127,39,255]);pma.fill(0)
 expect(rgba[0]).toBe(128)
})
it('resets each trajectory to its captured hair RGB; clone continuation owns palette and counters',()=>{
 const state:BristleState={ordinal:0,oldPressure:1,ends:[],soak:soak()}
 expect(bristleGeometryStamps(brush,dab,state,[0,1,0],1)).toEqual([])
 const first=bristleGeometryStamps(brush,{...dab,x:4},state,[0,1,0],1)
 expect(first.map(s=>s.color)).toEqual([[1,0,0],[0,0,1]])
 expect(first.map(s=>s.bristleInk?.sampleAlpha)).toEqual([0,128/255])
 const clone=structuredClone(state);expect(clone.soak!.rgba).not.toBe(state.soak!.rgba)
 const a=bristleGeometryStamps(brush,{...dab,x:8},state,[1,1,0],9),b=bristleGeometryStamps(brush,{...dab,x:8},clone,[1,0,1],9)
 expect(a).toEqual(b);expect(a.map(s=>s.color)).toEqual([[1,0,0],[0,0,1]])
})
it('preserves sampled alpha without opacity depletion and replaces it when enabled including A0',()=>{
 for(const sampled of[0,128/255,1])for(const useOpacity of[false,true]){
  const profile=createBristleInkProfile({...ink,useOpacity}),cpu=createBristleInkState(1),bulk=createBristleInkState(1)
  cpu.hairs[0].inkAmount=1;bulk.hairs[0].inkAmount=1
  const line=beginBristleInkLine(cpu,0,[0,0],[1,0],.25,1,[1,0,0],false,sampled)
  const values=advanceBristleInkLine(profile,cpu,line,3).samples.map(v=>v.opacity)
  const span={...advanceBristleInkBulk(profile,bulk,0,[0,0],[1,0],.25,1,false),sampleAlpha:sampled}
  expect(values).toEqual([0,1,2].map(i=>bristleInkSpanOpacity(profile,span,i)))
  expect(values[0]).toBe(useOpacity?.25:sampled)
 }
})
it('saturation starts anew from saved RGB for each trajectory, without advancing the palette',()=>{
 const profile=createBristleInkProfile({...ink,useSaturation:true}),state=createBristleInkState(1),saved=soak(),before=[...saved.rgba]
 const one=beginBristleInkLine(state,0,[0,0],[1,0],1,1,[1,0,0],false,0)
 advanceBristleInkLine(profile,state,one,3)
 const two=beginBristleInkLine(state,0,[1,0],[2,0],1,1,[1,0,0],false,0)
 expect(two.color).toEqual([1,0,0]);expect([...saved.rgba]).toEqual(before)
})

import { expect,it } from 'vitest'
import type { BrushTip } from '@grafetto/shared'
import { smearPlacement,smearSourceShift } from './SmearPlacement'
import witnesses from './smearPlacement.witnesses.json'
const tip=(w:number,h:number):BrushTip=>({kind:'bitmap',hardness:1,aspect:1,angle:0,rotation:'fixed',imageSampling:{kind:'integer-pyramid',signal:'inverse-gray',sourceRect:{x:1,y:1,width:w,height:h}}})
it('matches all eight independent actual Qt allocation/centre witnesses with zero subpixels',()=>{
  for(const c of witnesses.cases){const radius=Math.max(c.width,c.height)/2,actual=smearPlacement(tip(c.width,c.height),8+c.phase,8+c.phase,radius,radius,c.angle)
    expect(actual.rect).toEqual(c.rect);expect(actual.placedCenter).toEqual(c.placedCenter)
  }
})
it('keeps mask and integer allocation centres distinct, flooring negative cursor-hotspot coordinates',()=>{
  const a=smearPlacement(tip(3,5),8.25,8.25,2.5,2.5,0)
  expect(a.maskCenter).toEqual({x:7.5,y:7.5});expect(a.placedCenter).toEqual({x:7.5,y:7.5})
  const negative=smearPlacement(tip(3,5),-8.25,-8.25,2.5,2.5,0)
  expect(negative.rect).toEqual({minX:-10,minY:-11,maxX:-7,maxY:-6})
  const fractional=smearPlacement(tip(3,5),8.25,8.25,1.25,1.25,0)
  expect(fractional.maskCenter).toEqual({x:7.75,y:8.25})
  expect(fractional.placedCenter).toEqual({x:8,y:8.5})
  expect(smearSourceShift({x:7.5,y:7.5},fractional)).toEqual({x:-1,y:-1})
  expect(smearSourceShift({x:8.5,y:9},fractional)).toEqual({x:1,y:1})
})
it('uses standard procedural axes and native min1 hotspot without changing source scale',()=>{
  const procedural:BrushTip={kind:'procedural',hardness:1,aspect:1,angle:0,rotation:'fixed',profile:{kind:'standard',shape:'rectangle',horizontalFade:1,verticalFade:1,antialias:true}}
  const actual=smearPlacement(procedural,8.25,8.25,1.5,2.5,0)
  expect(actual.rect).toEqual(smearPlacement(tip(3,5),8.25,8.25,2.5,2.5,0).rect)
  const tiny=smearPlacement(procedural,.25,-.25,.1,.2,0)
  expect(tiny.maskCenter).toEqual({x:-.5,y:-.5});expect(tiny.rect).toEqual({minX:-1,minY:-1,maxX:0,maxY:0})
  expect(()=>smearPlacement(procedural,0,0,0,1,0)).toThrow('Invalid')
})

import {it,expect} from 'vitest'
import {WetComponents} from './components-draft'
const dot=(x:number,y=128)=>({x,y,radius:32,aspect:1,angle:0})
it('keeps disconnected unfinished puddles, joins touching paint, and normalizes dose by area',()=>{
 const m=new WetComponents(512)
 const a=m.add([dot(96)],.3).component
 const b=m.add([dot(400)],.3).component
 expect(m.components).toHaveLength(2);expect(a.pending).toBe(true);expect(a.wet).toBeCloseTo(.3);expect(b.wet).toBeCloseTo(.3)
 const ext=m.add([dot(156)],.3)
 expect(ext.joined).toEqual([a.id]);expect(m.components).toHaveLength(2)
 expect(ext.component.wet).toBeLessThan(.34);expect(b.wet).toBeCloseTo(.3)
 const water=m.add([dot(400)],.3).component
 expect(water.wet).toBeCloseTo(.6);expect(ext.component.wet).toBeLessThan(.34)
 m.add([dot(220),dot(280),dot(340)],.3)
 expect(m.components).toHaveLength(1)
})

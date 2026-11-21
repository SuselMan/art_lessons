import { expect, it } from 'vitest'
import { isBrushLibrary } from './brushes.js'
import { filter192, library192 } from './filterMask192.testFixture.js'

it('admits bounded Color Balance only inside native filter policy',()=>{
 const brush=filter192()
 brush.filter={version:3,kind:'colorBalance',shadows:[-.6,.2,1],midtones:[0,0,0],highlights:[.6,-.2,-1],preserveLuminosity:true,maskPolicy:'native-dab-v1',sourcePolicy:'canonical-begin-v1',smudgeMode:false,composite:'copy'}
 expect(isBrushLibrary(library192(brush))).toBe(true)
 for(const change of [
  (x:typeof brush)=>{if(x.filter?.kind==='colorBalance')x.filter.shadows[0]=-1.01},
  (x:typeof brush)=>{if(x.filter?.kind==='colorBalance')Reflect.deleteProperty(x.filter,'preserveLuminosity')},
  (x:typeof brush)=>{x.version=191},
 ]){const bad=structuredClone(brush);change(bad);expect(isBrushLibrary(library192(bad))).toBe(false)}
})

it('admits bounded HSV saturation only inside native filter policy',()=>{
 const brush=filter192()
 brush.filter={version:3,kind:'hsvSaturation',amount:.5,maskPolicy:'native-dab-v1',sourcePolicy:'canonical-begin-v1',smudgeMode:false,composite:'copy'}
 expect(isBrushLibrary(library192(brush))).toBe(true)
 const bad=structuredClone(brush)
 if(bad.filter?.kind==='hsvSaturation')bad.filter.amount=1.01
 expect(isBrushLibrary(library192(bad))).toBe(false)
})

it('admits bounded seeded noise only inside native filter policy',()=>{
 const brush=filter192()
 brush.filter={version:3,kind:'noise',level:50,opacity:50,grayscale:false,seeds:[2973,3038,16114,13791],maskPolicy:'native-dab-v1',sourcePolicy:'canonical-begin-v1',smudgeMode:true,composite:'copy'}
 expect(isBrushLibrary(library192(brush))).toBe(true)
 const bad=structuredClone(brush)
 if(bad.filter?.kind==='noise')bad.filter.seeds[0]=-1
 expect(isBrushLibrary(library192(bad))).toBe(false)
})

it('admits bounded circular soft blur only inside native filter policy',()=>{
 const brush=filter192()
 brush.filter={version:3,kind:'softBlur',radiusX:41,radiusY:41,maskPolicy:'native-dab-v1',sourcePolicy:'canonical-begin-v1',smudgeMode:false,composite:'copy'}
 expect(isBrushLibrary(library192(brush))).toBe(true)
 const bad=structuredClone(brush)
 if(bad.filter?.kind==='softBlur')bad.filter.radiusY=40
 expect(isBrushLibrary(library192(bad))).toBe(false)
})

import {expect,it} from 'vitest'
import {isBrushLibrary} from './brushes'
import type {BrushLibrary} from './brushes'
const library=():BrushLibrary=>({schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Mask blender',source:'authored.kpp',warnings:[],descriptor:{
 id:'imported-0123456789abcdef01234567',version:1,model:'mixer',category:'paint',
 tip:{kind:'round',hardness:1,aspect:1,rotation:'fixed',angle:0},
 paperInteraction:0,spacing:.1,flow:1,flowPer:'pass',sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],opacity:1,pressureSmoothingPx:0,
 mixer:{source:'previousCanvas',algorithm:'krita-mask',load:0,initialLoad:0,pickup:.6,strength:1,smearAlpha:true,sampling:{mode:'maskMean',radius:.5},foreground:{rate:.7}}
}}]})
it('admits a bounded modern mask strategy and keeps legacy descriptors valid',()=>{
 const l=library();expect(isBrushLibrary(l)).toBe(true)
 delete l.brushes[0].descriptor.mixer!.sampling
 delete l.brushes[0].descriptor.mixer!.algorithm
 expect(isBrushLibrary(l)).toBe(true)
})
it('rejects weighted reservoir mixing and unknown source algorithms',()=>{
 const l=library(),m=l.brushes[0].descriptor.mixer!
 delete m.algorithm;expect(isBrushLibrary(l)).toBe(false)
 m.algorithm='krita-mask';delete m.source;expect(isBrushLibrary(l)).toBe(false)
 m.source='previousCanvas';Reflect.set(m,'algorithm','native-ish');expect(isBrushLibrary(l)).toBe(false)
})

import { expect,it } from 'vitest'
import type { BrushDescriptor } from '@grafetto/shared'
import { installBrushLibrary } from './brushLibrary'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { brushDraws,createTestEngine,dab,makeLayerAdd,makeStroke } from './testing/engineTestUtils'
let ordinal=0
function brush():BrushDescriptor {
 return {...digitalBrushFromPreset('hard-round'),id:`imported-${(++ordinal).toString(16).padStart(24,'d')}`,version:25,tip:{kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed',profile:{kind:'gaussian',fade:1e-6,antialias:true}},behavior:{version:2}}
}
function paint(descriptor:BrushDescriptor){
 installBrushLibrary({schemaVersion:1,brushes:[{name:'Authored Gaussian',source:'qa',warnings:[],descriptor}],assets:[],skipped:[]})
 const {engine}=createTestEngine({userId:'observer'},{width:32,height:32})
 try{
  engine.appendOperation(makeLayerAdd('peer','ink'))
  engine.appendOperation(makeStroke('peer','ink',[dab(16,16,{size:4,pressure:1,opacity:1})],{tool:'digitalBrush',preset:`brush:${descriptor.id}@25`,strokeId:'gaussian',strokeEnd:true}),'remote')
  return brushDraws(engine).filter(d=>d.kind==='stamp' && d.uniforms.get('u_ceilingPass')===0).map(d=>d.uniforms)
 }finally{engine.destroy()}
}
it('routes primary Gaussian parameters and allows the supersampled exterior pixel',()=>{
 const draws=paint(brush());expect(draws.length).toBeGreaterThan(0)
 expect(draws[0].get('u_tipKind')).toBe(2)
 expect(draws[0].get('u_tipProfile')).toEqual([1e-6,1])
 expect(draws[0].get('u_wickPx')).toBe(1)
 expect(draws[0].get('u_dabRadius')).toBe(2)
})
it('uses the same profile for inline and independent child stamps',()=>{
 for(const sampling of ['primary','independent'] as const){
  const parent=brush(),child=brush();delete parent.tip.profile
  parent.behavior={version:2,dual:{brush:child,blendMode:'multiply',...(sampling==='independent'?{sampling:'independent' as const}:{})}}
  const draws=paint(parent)
  if(sampling==='primary'){
   expect(draws[0].get('u_dualKind')).toBe(3)
   expect(draws[0].get('u_dualProfile')).toEqual([1e-6,1])
  }else expect(draws.some(d=>d.get('u_tipKind')===2 && (d.get('u_tipProfile') as number[])[0]===1e-6)).toBe(true)
 }
})
it('keeps legacy round dispatch and geometry unexpanded when profile is absent',()=>{
 const descriptor=brush();delete descriptor.tip.profile
 const draw=paint(descriptor)[0]
 expect(draw.get('u_tipKind')).toBe(0);expect(draw.get('u_wickPx')).toBe(0)
})

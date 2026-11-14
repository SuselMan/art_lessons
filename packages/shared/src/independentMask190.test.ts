import{describe,it,expect}from'vitest'
import{readFileSync,readdirSync}from'node:fs'
import{dirname,join}from'node:path'
import{isBrushLibrary,hasBrushSourceInputs,hasIndependentMask190Scope,isIndependentMask190Component}from'./brushes.js'
import{isBrushBehavior}from'./brushBehavior.js'
const source=()=>JSON.parse(readFileSync(process.env.NATIVE190_LIBRARY!,'utf8'))
describe('whole native190 mask role/schema',()=>{
 it('accepts genuine seven-option native output and actual child identity only',()=>{
  const library=source(),root=library.brushes[0].descriptor,child=root.behavior.dual.brush
  expect(hasIndependentMask190Scope(root)).toBe(true);expect(isBrushLibrary(library)).toBe(true)
  expect(isIndependentMask190Component(root,child)).toBe(true);expect(isIndependentMask190Component(root,structuredClone(child))).toBe(false)
  expect(isBrushLibrary({...library,brushes:[{...library.brushes[0],descriptor:child}]})).toBe(false)
  expect(child.behavior.modulations.size[0].combine.scaling.map((v:{control:string})=>v.control)).toEqual(['pressureIn','perspective','tangentialPressure'])
 })
 it('validates actual native original colored planes for all eight GIH selectors',()=>{
  const directory=join(dirname(process.env.NATIVE190_LIBRARY!),'pipes')
  for(const name of readdirSync(directory).filter(name=>name.endsWith('.json'))){expect(isBrushLibrary(JSON.parse(readFileSync(join(directory,name),'utf8'))),name).toBe(true)}
  expect(readdirSync(directory).filter(name=>name.endsWith('.json'))).toHaveLength(8)
 })
 it('requires allocation and angle on every actual190 request before execution',()=>{
  const root=source().brushes[0].descriptor
  expect(hasBrushSourceInputs(root,[])).toBe(true)
  const dab={x:0,y:0,size:10,opacity:1,angle:0,aspectRatio:1,pressure:.5,tiltX:0,tiltY:0,t:0,sourceSize:Math.fround(16.3),sourceScale:1,sourceAngle:0,sourceTwist:90,sourceTangentialPressure:.5}
  expect(hasBrushSourceInputs(root,[dab])).toBe(true)
  for(const field of['sourceSize','sourceScale','sourceAngle']as const){const broken={...dab};delete (broken as Partial<typeof dab>)[field];expect(hasBrushSourceInputs(root,[broken])).toBe(false)}
 })
 it('rejects other paint engines, nested masks, malformed controls and resource policy',()=>{
  for(const mutate of[(d:ReturnType<typeof source>)=>{d.brushes[0].descriptor.model='mixer'},(d:ReturnType<typeof source>)=>{d.brushes[0].descriptor.behavior.dual.brush.behavior.dual=d.brushes[0].descriptor.behavior.dual},(d:ReturnType<typeof source>)=>{d.brushes[0].descriptor.behavior.dual.brush.behavior.modulations.size[0].combine.scaling[0].control=['pressureIn']},(d:ReturnType<typeof source>)=>{d.brushes[0].descriptor.behavior.dual.sizePolicy.diameter=Infinity}]){const value=source();mutate(value);expect(isBrushLibrary(value)).toBe(false)}
 })
 it('keeps new control structural validation separate from whole-role admission',()=>{
  const response={control:'pressureIn',minimum:0,jitter:0}
  expect(isBrushBehavior({version:2,dynamics:{size:response}})).toBe(true)
  const value=source();value.brushes[0].descriptor.version=189;expect(isBrushLibrary(value)).toBe(false)
 })
})

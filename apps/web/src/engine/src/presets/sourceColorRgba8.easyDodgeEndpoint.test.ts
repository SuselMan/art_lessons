import {beforeAll,afterAll} from 'vitest'
import {loadScalarPowerTestTables} from '../../testing/scalarPowerTestAssets'
import {it,expect}from 'vitest'
import {sourceRgba8SeparableChannel as rawChannel,compositeRgba8 as rawComposite,SOURCE_RGBA8_GENERIC_SC_PROFILE as profile}from './sourceColorRgba8'
import {SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL as es1}from '../raster/sourceRgba8CompositeWebGL1'
import {SOURCE_RGBA8_COMPOSITE_GLSL as es3}from '../raster/sourceRgba8CompositeShader'
it('retains native easyDodge source-white priority before zero-destination endpoint for allbytes',()=>{
 for(let source=0;source<256;source++){
  const expected=source===255?255:0
  expect(sourceRgba8SeparableChannel('easyDodge',source,0)).toBe(expected)
  expect(compositeRgba8([source,source,source,255],[0,0,0,255],{mode:'easyDodge',profile,opacity:1})).toEqual([expected,expected,expected,255])
 }
})
it('both actual shader bodies branch source255 then destination0 before driver pow',()=>{
 for(const shader of [es1,es3])expect(shader).toContain('if(mode==95.0)return s==255.0?255.0:d==0.0?0.0:sourceRgba8Scalar23Round(pow(y,(1.0-x)*1.039999999));')
})

let powerTables:Awaited<ReturnType<typeof loadScalarPowerTestTables>>
beforeAll(async()=>{powerTables=await loadScalarPowerTestTables()})
afterAll(()=>powerTables.release())
const channel=(mode:Parameters<typeof rawChannel>[0],s:number,d:number)=>rawChannel(mode,s,d,powerTables.context(mode))
const sourceRgba8SeparableChannel=channel
const compositeRgba8=(s:Parameters<typeof rawComposite>[0],d:Parameters<typeof rawComposite>[1],control:Parameters<typeof rawComposite>[2])=>rawComposite(s,d,control,powerTables.context(control.mode))

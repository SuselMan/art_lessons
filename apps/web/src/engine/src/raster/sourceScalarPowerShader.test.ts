import {expect,it} from 'vitest'
import {scalarPowerFragmentVariant} from './sourceScalarPowerShader'
import {SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL as es1} from './sourceRgba8CompositeWebGL1'
import {SOURCE_RGBA8_COMPOSITE_GLSL as es3} from './sourceRgba8CompositeShader'
import {SOURCE_SCALAR_POWER_MODES} from '../presets/sourceScalarPowerTable'
it('derives both actual kernels with exact finite-byte lookup only at the selected functor and correct texture dialect',()=>{
 const ids=[95,96,97,99,100]
 for(const [index,mode]of SOURCE_SCALAR_POWER_MODES.entries())for(const [body,dialect]of [[es1,'webgl1'],[es3,'webgl2']]as const){
  const variant=scalarPowerFragmentVariant(body,mode,dialect),id=ids[index]
  expect(variant).toContain('if(mode=='+id+'.0)return sourceScalarPowerByte(s,d);')
  expect(variant).toContain(dialect==='webgl2'?'texture(scalarPowerTexture':'texture2D(scalarPowerTexture')
  const old=body.match(new RegExp('if\\(mode=='+id+'\\.0\\)[^\\n]*'))?.[0];expect(old).toBeTruthy()
  const helperStart=variant.indexOf('\nuniform highp sampler2D scalarPowerTexture;'),helperEnd=variant.indexOf('float sourceRgba8Scalar23Real(')
  expect(helperStart).toBeGreaterThanOrEqual(0);expect(helperEnd).toBeGreaterThan(helperStart)
  const reversed=(variant.slice(0,helperStart)+variant.slice(helperEnd)).replace('if(mode=='+id+'.0)return sourceScalarPowerByte(s,d);',old!)
  expect(reversed).toBe(body)
 }
})

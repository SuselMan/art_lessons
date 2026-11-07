import {describe,it,expect} from 'vitest'
import {wetTransferFragment,WET_TRANSFER_FRAG} from './wetMixShaders'
describe('modern Color Smudge compiler combinations',()=>{
 it('assembles mask, material, integer and curve branches without colliding anchors',()=>{
  for(const procedural of [false,true])for(const images of [false,true])for(const curves of [false,true]){
   const source=wetTransferFragment(procedural,images,curves,true)
   expect(source).toContain('uniform vec2 u_colorSmudgeHeight')
   expect(source.match(/void main\(\)/g)).toHaveLength(1)
   expect(source).toContain('if(u_colorSmudge.w>1.5)')
  }
 })
 it('leaves the native ordinary compiler input unchanged',()=>{
  expect(wetTransferFragment()).toBe(WET_TRANSFER_FRAG)
  expect(wetTransferFragment(true,true,true)).not.toContain('u_colorSmudgeHeight')
 })
})

it('dispatches Photoshop only inside modern foreground composition and retains alpha shell',()=>{
 const shader=wetTransferFragment(true,true,true,true)
 expect(shader).toContain('uniform float u_colorSmudgePhotoshop')
 expect(shader).toContain('step(vec3(256.0),floor(clamp(dst,0.0,1.0)*255.0+0.5)+floor(clamp(src,0.0,1.0)*255.0+0.5))')
 expect(shader).toContain('if(u_colorSmudgePhotoshop<0.5 && u_wetBlend<0.5)return pigment+destination*(1.0-pigment.a)')
 expect(shader).toContain('u_colorSmudge.z>0.5 && pigment.a>0.0 && u_wetBlend<0.5 && u_colorSmudgePhotoshop<0.5')
 expect(shader).toContain('pigment.a+destination.a*(1.0-pigment.a)')
 expect(wetTransferFragment()).not.toContain('u_colorSmudgePhotoshop')
 expect(wetTransferFragment(true,true,true)).not.toContain('u_colorSmudgePhotoshop')
})

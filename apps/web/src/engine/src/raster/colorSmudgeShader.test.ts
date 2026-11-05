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

import {expect,it} from 'vitest'
import type {BrushDescriptor} from '@grafetto/shared'
import {installBrushPixels} from '../presets/importedBrushes'
import {brushTextureApplication} from './brushTextureApplication'
import type {TextureAlphaExtendedMode} from '../raster/textureAlphaModes'
const id=`asset:${'a79c'.repeat(16)}` as const
installBrushPixels(id,new Uint8Array(64).fill(128))
const texture:NonNullable<BrushDescriptor['texture']>={id,strength:.5,periodPx:10,patternSize:{width:5,height:3},offset:{x:1.25,y:-.5,randomX:false,randomY:false}}
const modes:TextureAlphaExtendedMode[]=['darken','overlay','linearDodge','linearBurn']
it('maps all four actual pattern applications while retaining NPOT source grid, phase and old codes',()=>{
 for(const [i,mode] of modes.entries())for(const soft of [false,true]){
  const t={...texture,application:{mode,soft}}
  const primary=brushTextureApplication(t,42,14,5),child=brushTextureApplication(t,42,14,5,1)
  expect(primary.application).toEqual([3+i,Number(soft),5,3]);expect(primary.mapping).toEqual([10,8,2.75,5.5]);expect(child).toEqual(primary)
 }
 expect(brushTextureApplication({...texture,application:{mode:'multiply',soft:false}},42,0,0).application[0]).toBe(1)
 expect(brushTextureApplication({...texture,application:{mode:'subtract',soft:true}},42,0,0).application[0]).toBe(2)
})
it('keeps child random phase independent while preserving the same new alpha operator',()=>{
 const t={...texture,application:{mode:'overlay' as const,soft:true},offset:{x:0,y:0,randomX:true,randomY:true}}
 const primary=brushTextureApplication(t,123,0,0),child=brushTextureApplication(t,123,0,0,1)
 expect(primary.application).toEqual([4,1,5,3]);expect(child.application).toEqual(primary.application)
 expect(brushTextureApplication(t,123,10,6).mapping).toEqual(primary.mapping)
 expect(brushTextureApplication(t,123,10,6,1).mapping).toEqual(child.mapping)
})

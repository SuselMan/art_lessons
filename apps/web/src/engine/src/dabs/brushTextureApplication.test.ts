import { expect, it, vi } from 'vitest'
import type { BrushDescriptor } from '@grafetto/shared'
import { installBrushPixels } from '../presets/importedBrushes'
const random=vi.hoisted(()=>vi.fn((_seed:number,salt:number)=>salt%2===0?.25:.75))
vi.mock('../presets/digitalBrushPresets',()=>({brushDabRandom:random}))
import { brushTextureApplication } from './brushTextureApplication'
const id=`asset:${'f'.repeat(64)}` as const
installBrushPixels(id,new Uint8Array(64).fill(255))
const texture:NonNullable<BrushDescriptor['texture']>={id,strength:1,periodPx:10,patternSize:{width:5,height:3},application:{mode:'subtract',soft:false},offset:{x:3,y:-2,randomX:false,randomY:false}}
it('encodes a padded NPOT repeat, minus fixed phase and rectangular world period',()=>{
  expect(brushTextureApplication(texture,42,14,5)).toEqual({application:[2,0,5,3],mapping:[10,8,1,1]})
  expect(brushTextureApplication(texture,42,-6,-7).mapping).toEqual([10,8,1,1])
})
it('random axes independently replace fixed offsets with integer gesture phases',()=>{
  random.mockClear()
  const t={...texture,offset:{x:99,y:99,randomX:true,randomY:true}}
  expect(brushTextureApplication(t,42,14,5).mapping).toEqual([10,8,2,1])
  expect(random.mock.calls).toEqual([[42,0x70000],[42,0x70001]])
  expect(brushTextureApplication(t,42,24,11).mapping).toEqual([10,8,2,1])
  expect(brushTextureApplication({...t,offset:{...t.offset,randomY:false,y:2}},42,14,5).mapping).toEqual([10,8,2,3])
})
it('leaves historical descriptors inactive and does not consume random values',()=>{
  random.mockClear()
  expect(brushTextureApplication({...texture,application:undefined},42,100,200).application[0]).toBe(0)
  expect(random).not.toHaveBeenCalled()
})

it('keeps fractional fixed offsets and distinct component random streams',()=>{
  expect(brushTextureApplication({...texture,offset:{x:1.25,y:-.5,randomX:false,randomY:false}},42,14,5).mapping).toEqual([10,8,2.75,5.5])
  random.mockClear()
  brushTextureApplication({...texture,offset:{x:0,y:0,randomX:true,randomY:true}},42,0,0,1)
  expect(random.mock.calls).toEqual([[42,0x70010],[42,0x70011]])
})

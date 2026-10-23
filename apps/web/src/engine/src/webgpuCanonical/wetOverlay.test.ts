import { describe,it,expect } from 'vitest'
import { PaperWetness } from '../paper/paperWetness'
import { prepareCanonicalWetOverlay } from './wetOverlay'

describe('canonical native local wet overlay',()=>{
 it('keeps pending water immediately visible without committing it to interactions',()=>{
  const source=new PaperWetness();source.deposit('layer',48,48,20,.9,100,true,.7)
  const interactionBefore=source.sample('layer',48,48,100),map=prepareCanonicalWetOverlay([source],100)
  expect(map).not.toBeNull();expect(map!.rgba.some((b,k)=>k%4===0&&b>0)).toBe(true)
  expect(map!.rgba.some((b,k)=>k%4===1&&b>0)).toBe(true)
  expect(source.sample('layer',48,48,100)).toBe(interactionBefore)
  expect(interactionBefore).toBe(0)
 })
 it('unions sources and caps raster without rescaling the described world span',()=>{
  const a=new PaperWetness(),b=new PaperWetness();a.deposit('a',0,0,16,1,100);b.deposit('b',2400,0,16,.5,100)
  const map=prepareCanonicalWetOverlay([a,b],100)!
  expect(map.w).toBeLessThanOrEqual(162);expect(map.h).toBeLessThanOrEqual(162)
  expect(map.rect[0]).toBeLessThan(0);expect(map.rect[2]).toBeGreaterThan(2400)
  expect(map.rgba.some((v,k)=>k%4===0&&v>0)).toBe(true)
 })
 it('disables empty/dried overlay instead of uploading a pretend wet field',()=>{
  expect(prepareCanonicalWetOverlay([],0)).toBeNull()
  const source=new PaperWetness();source.deposit('layer',40,40,16,.9,0)
  expect(prepareCanonicalWetOverlay([source],1e9)).toBeNull()
 })
})

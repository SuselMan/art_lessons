import { describe, expect, it } from 'vitest'
import { lightnessMaterialMips } from './lightnessMaterial'
import { materialGroupBytes, materialMipPixelCount, materialPackingPlan, packMaterialMips } from './brushMaterialPacking'

const sources = Array.from({length: 5}, (_, i) => ({alpha:`asset:alpha-${i}`,gray:`asset:gray-${i}`}))

describe('material frame storage plan', () => {
  it('keeps logical order, independent gray identity and the legacy singleton', () => {
    const plan = materialPackingPlan(sources, 512)
    expect(plan.groups.map(group=>group.format)).toEqual(['rgba','rgba','la'])
    expect(plan.frames.map(frame=>frame.channels)).toEqual(['rg','ba','rg','ba','ra'])
    expect(plan.frames[0].group).toBe(plan.frames[1].group)
    expect(plan.groups[2].key).toBe('t:lightness:asset:alpha-4:asset:gray-4')
    expect(materialPackingPlan(structuredClone(sources),512)).toEqual(plan)
    expect(materialPackingPlan([{alpha:'same',gray:'gray-a'},{alpha:'same',gray:'gray-b'}],512).frames.map(frame=>frame.channels)).toEqual(['rg','ba'])
    const changed=materialPackingPlan([{...sources[0],gray:'other'},sources[1]],512)
    expect(changed.groups[0].key).not.toBe(plan.groups[0].key)
    expect(materialPackingPlan(sources.slice(0,2).reverse(),512).groups[0].key).not.toBe(plan.groups[0].key)
    expect(materialPackingPlan(sources,256).groups[0].key).not.toBe(plan.groups[0].key)
    expect(Object.isFrozen(plan.groups[0].frames[0])).toBe(true)
  })
  it('fits the actual five material plus seven alpha animation budget without increasing either cap', () => {
    const plan=materialPackingPlan(sources,512)
    const cpu=plan.groups.reduce((sum,g)=>sum+materialGroupBytes(g).cpu,0)
    const primaryGpu=plan.groups.reduce((sum,g)=>sum+materialGroupBytes(g).gpu,0)
    expect(cpu).toBe(3_495_250)
    expect(cpu).toBe(materialMipPixelCount(512)*2*5)
    expect(cpu).toBeLessThan(4*1024*1024)
    const childGpu=7*materialMipPixelCount(512)*4,grainGpu=512*512*4,surfaceGpu=2*materialMipPixelCount(256)*4
    expect(primaryGpu+childGpu+grainGpu+surfaceGpu).toBe(15*1024*1024-16)
    expect(primaryGpu+childGpu+grainGpu+surfaceGpu).toBeLessThan(16*1024*1024)
    const oldGpu=5*materialMipPixelCount(512)*4+childGpu+grainGpu+surfaceGpu
    expect(oldGpu).toBeGreaterThan(16*1024*1024)
  })
  it('rejects unsupported dimensions and incomplete source identities',()=>{
    for(const side of [0,1,3,4096,NaN]) expect(()=>materialPackingPlan(sources,side)).toThrow()
    expect(()=>materialPackingPlan([],4)).toThrow()
    expect(()=>materialPackingPlan([{alpha:'a',gray:''}],4)).toThrow()
  })
})

describe('packed material byte oracle', () => {
  it('preserves both old premultiplied LA bytes at every mip level, including transparent edges', () => {
    const size=8
    const alpha0=Uint8Array.from({length:size*size},(_,i)=>i%5===0?0:(i*37)%256)
    const gray0=Uint8Array.from({length:size*size},(_,i)=>(i*19+7)%256)
    const alpha1=Uint8Array.from({length:size*size},(_,i)=>i%3===0?255:(i*11)%256)
    const gray1=Uint8Array.from({length:size*size},(_,i)=>(i*73+91)%256)
    const old=[lightnessMaterialMips(alpha0,gray0),lightnessMaterialMips(alpha1,gray1)]
    const snapshot=old.map(chain=>chain.map(level=>level.slice()))
    const group=materialPackingPlan(sources.slice(0,2),size).groups[0]
    const packed=packMaterialMips(group,old)
    packed.forEach((level,lod)=>{
      const decoded=[new Uint8Array(level.length/2),new Uint8Array(level.length/2)]
      for(let i=0;i<level.length/4;i++)for(let frame=0;frame<2;frame++) {
        decoded[frame][i*2]=level[i*4+frame*2]
        decoded[frame][i*2+1]=level[i*4+frame*2+1]
      }
      expect(decoded[0]).toEqual(old[0][lod])
      expect(decoded[1]).toEqual(old[1][lod])
    })
    expect(old).toEqual(snapshot)
    expect(packed.reduce((sum,level)=>sum+level.byteLength,0)).toBe(materialGroupBytes(group).cpu)
  })
  it('retains a singleton chain by identity and rejects malformed mip inputs',()=>{
    const chain=lightnessMaterialMips(new Uint8Array(16).fill(127),new Uint8Array(16).fill(63))
    const group=materialPackingPlan(sources.slice(0,1),4).groups[0]
    expect(packMaterialMips(group,[chain])).toBe(chain)
    expect(()=>packMaterialMips(group,[])).toThrow()
    expect(()=>packMaterialMips(group,[chain.slice(1)])).toThrow()
    expect(()=>packMaterialMips(group,[[new Uint8Array(31),...chain.slice(1)]])).toThrow()
  })
})

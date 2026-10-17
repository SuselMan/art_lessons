import {describe,it,expect,vi} from 'vitest'
import {capturePagedPuddleSource} from './PagedPuddleSource'
import type {RibbonStrokeScratch} from '../../buffers/RibbonStrokeScratch'
import type {ILayerBuffer} from '../../buffers/ILayerBuffer'
import type {RibbonScratchPool} from '../../buffers/RibbonScratchPool'
import type {WatercolorPasses} from '../../raster/WatercolorPasses'

describe('paged canonical source capture',()=>{
  it('reads raw planes across tiles, clips the bottom overhang, and freezes the revision',()=>{
    const pixels=(value:number)=>({readPixels:()=>new Uint8Array(4*4*4).fill(value)})
    const tiles=[{originX:0,originY:0,buffer:{width:4,height:4}},
      {originX:4,originY:4,buffer:{width:4,height:4}}]
    const a={original:pixels(9),inkLoad:pixels(11),inkColor:pixels(12),coverage:pixels(13),solventLoad:pixels(14)}
    const b={original:pixels(19),inkLoad:pixels(21),inkColor:pixels(22),coverage:pixels(23),foreignSolventLoad:pixels(24)}
    const source={peek:(key:unknown)=>key===tiles[0]!.buffer?a:b} as unknown as RibbonStrokeScratch
    const target={allResident:()=>tiles} as unknown as ILayerBuffer
    const captured=capturePagedPuddleSource(source,target,{width:6,height:7},{} as RibbonScratchPool,{} as WatercolorPasses)
    expect([...captured.inkLoad.readRect({x:0,y:3,width:1,height:1})]).toEqual([11,11,11,11])
    expect([...captured.inkLoad.readRect({x:5,y:0,width:1,height:1})]).toEqual([21,21,21,21])
    expect([...captured.inkLoad.readRect({x:0,y:0,width:1,height:1})]).toEqual([0,0,0,0])
    expect([...captured.water.readRect({x:5,y:0,width:1,height:1})]).toEqual([24,24,24,24])
    b.inkLoad=pixels(99)
    expect([...captured.inkLoad.readRect({x:5,y:0,width:1,height:1})]).toEqual([21,21,21,21])
  })
  it('combines local and foreign water using the canonical GPU pass and always returns temporary ownership',()=>{
    const raw={readPixels:()=>new Uint8Array(16).fill(7)}
    const entry={original:raw,inkLoad:raw,inkColor:raw,coverage:raw,solventLoad:raw,foreignSolventLoad:raw}
    const temporary={readPixels:()=>new Uint8Array(16).fill(31)}
    const acquire=vi.fn(()=>temporary),release=vi.fn(),fieldOp=vi.fn()
    const source={peek:()=>entry} as unknown as RibbonStrokeScratch
    const target={allResident:()=>[{originX:0,originY:0,buffer:{width:2,height:2}}]} as unknown as ILayerBuffer
    const captured=capturePagedPuddleSource(source,target,{width:2,height:2},
      {acquire,release} as unknown as RibbonScratchPool,{fieldOp} as unknown as WatercolorPasses)
    expect(fieldOp).toHaveBeenCalledExactlyOnceWith(temporary,raw,raw,1,1)
    expect(release).toHaveBeenCalledExactlyOnceWith(temporary)
    expect([...captured.water.readRect({x:0,y:0,width:2,height:2})]).toEqual(new Array(16).fill(31))
    temporary.readPixels=()=>{throw Error('readback failed')}
    expect(()=>capturePagedPuddleSource(source,target,{width:2,height:2},
      {acquire,release} as unknown as RibbonScratchPool,{fieldOp} as unknown as WatercolorPasses)).toThrow('readback failed')
    expect(release).toHaveBeenCalledTimes(2)
  })
})

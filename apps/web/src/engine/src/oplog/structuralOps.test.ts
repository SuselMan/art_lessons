import { describe, expect, it, vi } from 'vitest'
import type { LayerDuplicateOperation, LayerMergeOperation } from '@grafetto/shared'
import type { ILayerBuffer, PaintTarget } from '../buffers/ILayerBuffer'
import { StructuralOps, type StructuralOpsContext } from './structuralOps'

const duplicate: LayerDuplicateOperation = {id:'copy',type:'layer_duplicate',userId:'A',timestamp:1,layerId:'D',sourceId:'S',name:'D',sourceOpacity:1,sourceVisible:true,parentId:null,index:0}
const merge: LayerMergeOperation = {id:'merge',type:'layer_merge',userId:'A',timestamp:1,layerId:'M',name:'M',sources:[{id:'S',opacity:1},{id:'T',opacity:.5}],parentId:null,index:0}
function setup() {
  const events: string[]=[]
  const tile=(texture: string)=>({originX:0,originY:0,contentRect:{minX:0,minY:0,maxX:16,maxY:16},buffer:{texture,fbo:{},width:16,height:16}} as unknown as PaintTarget)
  const buffer=(name: string)=>({allResident:()=>[tile(name+'-shown')],resolveForPaint:()=>[tile(name+'-output')],markContentPainted:vi.fn(),clear:vi.fn(),destroy:()=>events.push('destroy:'+name)} as unknown as ILayerBuffer)
  const layers=new Map([['S',buffer('S')],['T',buffer('T')]])
  let temp=0
  const composite=vi.fn()
  const ctx={ledger:{isCovered:()=>false,markDirty:vi.fn()},log:()=>({layerPixelOps:()=>[]}),
    layer:(id:string)=>layers.get(id),hasLayer:(id:string)=>layers.has(id),setLayer:(id:string,b:ILayerBuffer)=>layers.set(id,b),
    makeLayerBuffer:(id?:string)=>buffer(id??'temp'+(++temp)),createBuffer:vi.fn(),destroyBuffer:(id:string)=>layers.delete(id),
    replayInto:vi.fn(),canonicalTiles:(source:ILayerBuffer)=>[{...source.allResident()[0],buffer:{...source.allResident()[0].buffer,texture:'canonical-target'}}],
    releaseReplaySource:()=>events.push('release'),compositeTextures:composite,takeCheckpoint:vi.fn(),invalidateSplitCache:vi.fn(),displayIfNotSuspended:vi.fn(),
  } as unknown as StructuralOpsContext
  return{ops:new StructuralOps(ctx),ctx,events,layers,composite,buffer}
}

describe('structural material reads',()=>{
  it('duplicates canonical target while preserving the original presentation and layer',()=>{
    const {ops,layers,composite}=setup(),source=layers.get('S')!
    const shown=source.allResident()[0].buffer.texture
    ops.execDuplicate(duplicate)
    expect(composite.mock.calls[0][0]).toEqual([{texture:'canonical-target',opacity:1}])
    expect(layers.get('S')).toBe(source)
    expect(source.allResident()[0].buffer.texture).toBe(shown)
    expect(layers.has('D')).toBe(true)
  })
  it('uses canonical sources in live merge before consuming both layers',()=>{
    const {ops,layers,composite}=setup();ops.execMerge(merge)
    expect(composite.mock.calls.map(c=>c[0])).toEqual([[{texture:'canonical-target',opacity:1}],[{texture:'canonical-target',opacity:.5}]])
    expect([...layers.keys()]).toEqual(['M'])
  })
  it('releases replay material before destroying a duplicate scratch, even on compositing failure',()=>{
    const {ops,events,composite,buffer}=setup();composite.mockImplementation(()=>{throw Error('GPU read failed')})
    expect(()=>ops.replayDuplicateInto(buffer('out'),duplicate)).toThrow('GPU read failed')
    expect(events).toEqual(['release','destroy:temp1'])
  })
  it('releases every merge replay source before destruction',()=>{
    const {ops,events,buffer}=setup();ops.replayMergeInto(buffer('out'),merge)
    expect(events).toEqual(['release','destroy:temp1','release','destroy:temp2'])
  })
  it('also releases a replay source if decoding throws before compositing',()=>{
    const {ops,ctx,events,buffer}=setup();vi.spyOn(ctx,'replayInto').mockImplementation(()=>{throw Error('decode failed')})
    expect(()=>ops.replayDuplicateInto(buffer('out'),duplicate)).toThrow('decode failed')
    expect(events).toEqual(['release','destroy:temp1'])
  })
})

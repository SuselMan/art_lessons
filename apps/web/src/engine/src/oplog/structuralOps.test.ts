import { describe, expect, it, vi } from 'vitest'
import type { LayerDuplicateOperation, LayerMergeOperation, Operation } from '@grafetto/shared'
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
  const log={entries:[] as Array<{op:Operation;state:'done'}>,layerPixelOps:vi.fn(()=>[])}
  const ctx={ledger:{isCovered:()=>false,markDirty:vi.fn()},log:()=>log,
    layer:(id:string)=>layers.get(id),hasLayer:(id:string)=>layers.has(id),setLayer:(id:string,b:ILayerBuffer)=>layers.set(id,b),
    makeLayerBuffer:(id?:string)=>buffer(id??'temp'+(++temp)),createBuffer:vi.fn(),destroyBuffer:(id:string)=>layers.delete(id),
    replayInto:vi.fn(),canonicalTiles:(source:ILayerBuffer)=>[{...source.allResident()[0],buffer:{...source.allResident()[0].buffer,texture:'canonical-target'}}],
    releaseReplaySource:()=>events.push('release'),compositeTextures:composite,takeCheckpoint:vi.fn(),invalidateSplitCache:vi.fn(),displayIfNotSuspended:vi.fn(),
  } as unknown as StructuralOpsContext
  return{ops:new StructuralOps(ctx),ctx,events,layers,composite,buffer,log}
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

it('forwards the structural cutoff to both duplicate and merge source replay',()=>{
  const {ops,ctx,buffer}=setup()
  ops.replayDuplicateInto(buffer('out'),{...duplicate,seq:7})
  expect(ctx.replayInto).toHaveBeenLastCalledWith(expect.anything(),'S',[],7)
  ops.replayMergeInto(buffer('out'),{...merge,seq:9})
  expect(ctx.replayInto).toHaveBeenCalledWith(expect.anything(),'S',[],9)
  expect(ctx.replayInto).toHaveBeenLastCalledWith(expect.anything(),'T',[],9)
})

describe('provisional source order',()=>{
  it('replays the historical prefix for a live duplicate whose source is unsettled',()=>{
    const {ops,ctx,layers,events}=setup();ctx.sourceNeedsReplay=id=>id==='S'
    const original=layers.get('S')
    ops.execDuplicate({...duplicate,seq:7})
    expect(ctx.replayInto).toHaveBeenCalledExactlyOnceWith(expect.anything(),'S',[],7)
    expect(events).toEqual(['release','destroy:temp1'])
    expect(layers.get('S')).toBe(original)
  })
  it('replays every merge source when even one source needs ordered recovery',()=>{
    const {ops,ctx,layers}=setup();ctx.sourceNeedsReplay=id=>id==='T'
    ops.execMerge({...merge,seq:9})
    expect(ctx.replayInto).toHaveBeenCalledTimes(2)
    expect(ctx.replayInto).toHaveBeenCalledWith(expect.anything(),'S',[],9)
    expect(ctx.replayInto).toHaveBeenCalledWith(expect.anything(),'T',[],9)
    expect([...layers.keys()]).toEqual(['M'])
  })
  it('keeps the canonical live fast path when both sources are already ordered',()=>{
    const {ops,ctx}=setup();ctx.sourceNeedsReplay=()=>false
    ops.execDuplicate(duplicate);ops.execMerge(merge)
    expect(ctx.replayInto).not.toHaveBeenCalled()
  })
})

describe('wire seq versus local structural cutoff',()=>{
  it('uses the recorded local position for a pending merge with no wire seq',()=>{
    const {ops,ctx,log}=setup();ctx.sourceNeedsReplay=()=>true
    log.entries.push({op:{...merge,seq:4},state:'done'})
    ops.execMerge(merge)
    expect(ctx.replayInto).toHaveBeenCalledWith(expect.anything(),'S',[],4)
    expect(ctx.replayInto).toHaveBeenLastCalledWith(expect.anything(),'T',[],4)
  })
  it('uses the recorded local position for a pending duplicate with no wire seq',()=>{
    const {ops,ctx,log}=setup();ctx.sourceNeedsReplay=()=>true
    log.entries.push({op:{...duplicate,seq:3},state:'done'})
    ops.execDuplicate(duplicate)
    expect(ctx.replayInto).toHaveBeenCalledExactlyOnceWith(expect.anything(),'S',[],3)
  })
  it('checks snapshot coverage at server seq but replays at the recorded local cutoff',()=>{
    const {ops,ctx,log}=setup();ctx.sourceNeedsReplay=()=>true
    const covered=vi.spyOn(ctx.ledger,'isCovered')
    log.entries.push({op:{...duplicate,seq:3},state:'done'})
    ops.execDuplicate({...duplicate,seq:50})
    expect(covered).toHaveBeenCalledExactlyOnceWith('D',50)
    expect(ctx.replayInto).toHaveBeenCalledExactlyOnceWith(expect.anything(),'S',[],3)
  })
  it('retains a covered merge snapshot without replay even when its source needs ordering',()=>{
    const {ops,ctx,log}=setup();ctx.sourceNeedsReplay=()=>true
    log.entries.push({op:{...merge,seq:4},state:'done'})
    vi.spyOn(ctx.ledger,'isCovered').mockReturnValue(true)
    ops.execMerge({...merge,seq:50})
    expect(ctx.replayInto).not.toHaveBeenCalled()
  })
})

import { expect, it, vi } from 'vitest'
import { PencilEngine } from './index'
import { createTestEngine } from './testing/engineTestUtils'
import { MockGL } from './testing/mockGL'
import { TiledLayerBuffer } from './src/buffers/TiledLayerBuffer'
import type { ILayerBuffer } from './src/buffers/ILayerBuffer'

const bounds={minX:0,minY:0,maxX:2,maxY:2}
type LayerFactory={_makeLayerBuffer(layerId?:string):ILayerBuffer;_downsampleTileInto(...args:unknown[]):void}

it.each([undefined,'canonical-layer'])('prepares straight %s storage through the real engine factory without a PM pyramid',layerId=>{
  const {engine,canvas}=createTestEngine(),actual=engine as unknown as LayerFactory
  // Private receiver seam only: the admitted real engine and public reader
  // remain legacy. No constructor guard or production QA API is opened.
  const receiver=Object.create(engine)
  Object.defineProperty(receiver,'rasterVersion',{value:'straight-rgba8-v1'})
  const downsample=vi.spyOn(actual,'_downsampleTileInto')
  let layer:ILayerBuffer|undefined
  try {
    layer=actual._makeLayerBuffer.call(receiver,layerId)
    expect(layer).toBeInstanceOf(TiledLayerBuffer)
    if(!(layer instanceof TiledLayerBuffer))throw Error('Expected actual tiled storage')
    expect(layer.pixelEncoding).toBe('straight-rgba8')
    const targets=layer.resolveForPaint(bounds)
    expect(targets).toHaveLength(1);expect(targets[0].buffer.pixelEncoding).toBe('straight-rgba8')
    expect((canvas.getContext('webgl') as unknown as MockGL).getMinFilter(targets[0].buffer.texture)).toBe(canvas.getContext('webgl')!.NEAREST)
    expect(layer.resolveCoarse(bounds,2)).toBeNull();expect(downsample).not.toHaveBeenCalled()
    expect(engine.rasterVersion).toBe('legacy-pm8-v1');expect(engine.getOperations()).toEqual([])
  } finally {layer?.destroy();engine.destroy()}
})
it.each([undefined,'legacy-layer'])('preserves actual legacy %s storage and existing downsample route',layerId=>{
  const {engine,canvas}=createTestEngine(),actual=engine as unknown as LayerFactory
  const downsample=vi.spyOn(actual,'_downsampleTileInto')
  let layer:ILayerBuffer|undefined
  try {
    layer=actual._makeLayerBuffer(layerId)
    if(!(layer instanceof TiledLayerBuffer))throw Error('Expected actual tiled storage')
    expect(layer.pixelEncoding).toBe('premultiplied-rgba8')
    const target=layer.resolveForPaint(bounds)[0].buffer
    expect(target.pixelEncoding).toBe('premultiplied-rgba8')
    expect((canvas.getContext('webgl') as unknown as MockGL).getMinFilter(target.texture)).toBe(canvas.getContext('webgl')!.LINEAR)
    const coarse=layer.resolveCoarse(bounds,2)
    if(layerId===undefined){expect(coarse).toBeNull();expect(downsample).not.toHaveBeenCalled()}
    else {expect(coarse).toHaveLength(1);expect(downsample).toHaveBeenCalledOnce()}
  } finally {layer?.destroy();engine.destroy()}
})
it('keeps straight room constructor admission closed before canvas access',()=>{
  const canvas=new Proxy({} as HTMLCanvasElement,{get(){throw Error('Canvas accessed before admission')}})
  expect(()=>new PencilEngine(canvas,{rasterVersion:'straight-rgba8-v1'})).toThrow('not supported by this renderer')
})

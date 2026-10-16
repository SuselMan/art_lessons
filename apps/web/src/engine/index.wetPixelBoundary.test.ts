import { describe, expect, it, vi } from 'vitest'
import type { ShapeOperation } from '@grafetto/shared'
import type { PixelOperation } from './src/oplog/OperationLog'
import { createTestEngine, makeLayerAdd, makeAreaClear, makeAreaTransform, makeAreaFill, makeAreaPaste, makeImageImport, makeLayerTransform } from './testing/engineTestUtils'

const rect={x:0,y:0,width:8,height:8}
const selection={points:[0,0,8,0,8,8,0,8]}
const matrix=[1,0,0,1,2,3] as [number,number,number,number,number,number]
const shape:ShapeOperation={id:'shape',type:'shape',userId:'a',timestamp:1,layerId:'L',geometry:{kind:'rectangle',cornerRadius:0},frame:{...rect,angle:0},stroke:null,fill:{color:[0,0,0]}}
const operations:PixelOperation[]=[shape,makeAreaClear('a','L',selection),makeAreaTransform('a','L',selection,matrix),makeAreaFill('a','L',rect),makeAreaPaste('a','L',rect),makeImageImport('a','L'),makeLayerTransform('a',[{layerId:'L',matrix}]),{id:'filter',type:'layer_filter',userId:'a',timestamp:2,layerId:'L',filter:{kind:'gaussian_blur',radius:2}}]

describe('ordinary pixel operations close M70 before reading or replacing its layer',()=>{
 for(const op of operations)it(op.type,async()=>{
  const {engine}=createTestEngine({watercolorModel:'m70-r2-v1'},{width:16,height:16})
  await engine.paperReady();engine.appendOperation(makeLayerAdd('a','L'))
  const target=engine['_layers'].get('L')!,puddle=engine['_puddleFor']()
  vi.spyOn(puddle,'has').mockReturnValue(true)
  const close=vi.spyOn(puddle,'close'),order:string[]=[]
  close.mockImplementation(()=>{order.push('close')})
  vi.spyOn(engine['_shapes'],'draw').mockImplementation(()=>{order.push('write')})
  vi.spyOn(engine['_filters'],'apply').mockImplementation(()=>{order.push('write')})
  vi.spyOn(engine['_images'],'paintDecoded').mockImplementation(()=>{order.push('write');return true})
  vi.spyOn(engine['_area'],'clearArea').mockImplementation(()=>{order.push('write')})
  vi.spyOn(engine['_area'],'bakeAreaTransform').mockImplementation(()=>{order.push('write')})
  vi.spyOn(engine['_area'],'bakeLayerTransform').mockImplementation(()=>{order.push('write')})
  try{
   engine.appendOperation(op)
   expect(close).toHaveBeenCalledWith(target)
   expect(order.indexOf('close')).toBeLessThan(order.indexOf('write'))
  }finally{engine.destroy()}
 })
})
it('writing an unrelated dry layer does not cancel a wet solver on another layer',async()=>{
 const {engine}=createTestEngine({watercolorModel:'m70-r2-v1'},{width:16,height:16})
 await engine.paperReady();engine.appendOperation(makeLayerAdd('a','L'))
 const puddle=engine['_puddleFor'](),close=vi.spyOn(puddle,'close')
 vi.spyOn(engine['_shapes'],'draw').mockImplementation(()=>{})
 try{engine.appendOperation(shape);expect(close).not.toHaveBeenCalled()}finally{engine.destroy()}
})
it('defers a foreign pixel writer under an active M70 pen and never destroys that scratch on a forced drain',async()=>{
 const {ribbonProfileFor}=await import('./src/dabs/ribbonProfile')
 const {engine}=createTestEngine({watercolorModel:'m70-r2-v1'},{width:16,height:16})
 await engine.paperReady();engine.appendOperation(makeLayerAdd('a','L'))
 const target=engine['_layers'].get('L')!,puddle=engine['_puddleFor']()
 const {scratch}=puddle.source(target,'held',ribbonProfileFor('watercolor','normal:95:34:PB29:round:wc@m70-r2-v1'),0)
 engine['_strokeLayerId']='L';engine['_strokeTool']='watercolor';engine['_ribbonStrokeScratch']=scratch
 const close=vi.spyOn(puddle,'close'),write=vi.spyOn(engine['_shapes'],'draw').mockImplementation(()=>{})
 try{
  engine.appendOperation(shape,'remote')
  expect(engine['_opQueue']).toHaveLength(1)
  expect(write).not.toHaveBeenCalled()
  engine['_flushOpQueue']()
  expect(close).not.toHaveBeenCalled()
  expect(engine['_puddleRebuildAtPenUp'].has('L')).toBe(true)
  expect(puddle.owns(scratch)).toBe(true)
 }finally{engine['_strokeLayerId']=null;engine['_ribbonStrokeScratch']=null;engine.destroy()}
})
